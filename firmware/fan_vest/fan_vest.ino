// 溫控風扇背心 - ESP32（藍牙 BLE 版）
// 需要的函式庫（Arduino IDE 程式庫管理員安裝）：OneWire、DallasTemperature、Adafruit INA219
// 開發板：ESP32 Dev Module，ESP32 core 3.x（BLE 函式庫已內建）
// 手機控制頁：用 Android Chrome 開啟 GitHub Pages 上的 docs/index.html
//
// 接線：
//   GPIO25 -> MOSFET 模組 PWM/TRIG，ESP32 GND -> 模組 GND
//   GPIO4  -> DS18B20 DATA（DATA 與 3.3V 之間接 4.7kΩ，模組版通常已內建）
//   DS18B20 VCC -> 3.3V，GND -> GND
//   INA219 模組：SDA -> GPIO21、SCL -> GPIO22、VCC -> 3.3V、GND -> GND
//                VIN+ 接保險絲後的 +12V，VIN- 接風扇正極（串在 12V 主線上）
//
// BLE 資料格式（皆為 little-endian）：
//   STATUS  （讀取／通知，10 bytes）：int16 溫度×10（-32768 = 感測器異常）、uint8 目前轉速%、uint8 自動模式(1/0)、uint8 手動設定%、
//                                    uint16 電壓 mV、int16 電流 mA、uint8 狀態旗標（見 FLAG_*）
//   CONTROL （寫入，2 bytes）     ：uint8 自動模式(1/0)、uint8 手動設定%（寫入時也會解除過電流保護）
//   CONFIG  （讀取，10 bytes）    ：int16 T0×10、int16 T1×10、int16 T2×10、uint8 最低轉速%、uint8 故障安全轉速%、uint16 過電流門檻 mA

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <Adafruit_INA219.h>

// ---- 藍牙 ----
const char* BLE_NAME = "FanVest";
#define SERVICE_UUID "7a1e0001-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define STATUS_UUID  "7a1e0002-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONTROL_UUID "7a1e0003-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONFIG_UUID  "7a1e0004-5c2b-4f0a-9d3e-6b8f2a4c9e10"

// ---- 腳位 ----
const int PIN_FAN  = 25;
const int PIN_TEMP = 4;
const int PIN_SDA  = 21;
const int PIN_SCL  = 22;

// ---- PWM ----
const int PWM_FREQ = 20000;  // 20kHz 聽不到嗡嗡聲；風扇轉不順可改 1000 試試
const int PWM_RES  = 8;      // 0~255

// ---- 自動模式參數 ----
const float T_OFF = 27.0;    // T0：低於此溫度停止（遲滯，避免頻繁開關）
const float T_ON  = 28.0;    // T1：高於此溫度啟動
const float T_MAX = 35.0;    // T2：高於此溫度全速
const int DUTY_MIN = 30;     // 風扇能穩定轉動的最低轉速 %，實測後調整
const int SENSOR_FAIL_PCT = 70;  // 感測器故障時的轉速，寧可吹也不要停
const unsigned long KICK_MS = 500;  // 從停止啟動時先全速轉一下，避免低速轉不起來

// ---- 電流保護參數（四顆風扇全速約 1~2A，請實測後調整） ----
const int OVERCURRENT_MA = 3000;      // 超過此電流視為短路或卡住，立即停止風扇
const unsigned long OVERCURRENT_MS = 300;  // 持續超過這麼久才跳脫，避免啟動瞬間誤判
const int FAN_MIN_MA = 80;            // 風扇在轉卻低於此電流，視為風扇沒接好或斷線
const int FAN_CHECK_PCT = 50;         // 轉速達此值以上才檢查低電流（低速時電流本來就小）
const unsigned long FAN_CHECK_DELAY_MS = 2000;  // 啟動後等電流穩定再檢查

// ---- 狀態旗標 ----
const uint8_t FLAG_POWER_SENSOR_MISSING = 0x01;  // 找不到 INA219
const uint8_t FLAG_OVERCURRENT          = 0x02;  // 過電流保護已跳脫，風扇停止
const uint8_t FLAG_FAN_LOW_CURRENT      = 0x04;  // 風扇電流過低，可能沒接好

OneWire oneWire(PIN_TEMP);
DallasTemperature sensors(&oneWire);
Adafruit_INA219 ina219;
BLECharacteristic* statusChar;

bool autoMode = true;
int manualPct = 50;
int currentPct = 0;
float tempC = NAN;
bool autoFanOn = false;
bool clientConnected = false;
volatile bool controlChanged = false;
unsigned long lastTempMs = 0;
unsigned long kickUntil = 0;

bool inaFound = false;
float busMv = 0, currentMa = 0;   // 一秒內的平均值
float sumMv = 0, sumMa = 0;
int samples = 0;
unsigned long lastSampleMs = 0;
unsigned long overSince = 0;      // 開始超過過電流門檻的時間，0 = 沒超過
unsigned long fanOnSince = 0;     // 風扇這次開始轉動的時間
bool overcurrentTripped = false;
bool fanLowCurrent = false;

int autoPercent(float t) {
  if (isnan(t)) return SENSOR_FAIL_PCT;
  if (!autoFanOn && t >= T_ON) autoFanOn = true;
  if (autoFanOn && t < T_OFF) autoFanOn = false;
  if (!autoFanOn) return 0;
  if (t >= T_MAX) return 100;
  float pct = DUTY_MIN + (t - T_ON) / (T_MAX - T_ON) * (100 - DUTY_MIN);
  return constrain((int)pct, DUTY_MIN, 100);
}

void setFan(int pct) {
  if (overcurrentTripped) pct = 0;  // 過電流保護跳脫後維持停止，直到使用者重新下指令
  if (pct > 0 && pct < DUTY_MIN) pct = DUTY_MIN;
  if (pct > 0 && currentPct == 0) {
    kickUntil = millis() + KICK_MS;
    fanOnSince = millis();
  }
  currentPct = pct;
}

void writeFan() {
  int pct = (millis() < kickUntil) ? 100 : currentPct;
  ledcWrite(PIN_FAN, pct * 255 / 100);
}

// 每 100ms 取樣一次電流，過電流要即時處理，其餘取一秒平均
void sampleCurrent() {
  if (!inaFound || millis() - lastSampleMs < 100) return;
  lastSampleMs = millis();
  float mv = ina219.getBusVoltage_V() * 1000 + ina219.getShuntVoltage_mV();  // 電池端電壓
  float ma = ina219.getCurrent_mA();
  sumMv += mv;
  sumMa += ma;
  samples++;

  if (ma > OVERCURRENT_MA) {
    if (overSince == 0) overSince = millis();
    if (!overcurrentTripped && millis() - overSince >= OVERCURRENT_MS) {
      overcurrentTripped = true;
      setFan(0);
      writeFan();
      Serial.printf("過電流 %.0f mA，風扇已停止\n", ma);
    }
  } else {
    overSince = 0;
  }
}

void updatePowerAverage() {
  if (!inaFound || samples == 0) return;
  busMv = sumMv / samples;
  currentMa = sumMa / samples;
  sumMv = sumMa = 0;
  samples = 0;

  // 轉速夠高、啟動也過了一段時間，電流卻很小 -> 風扇可能沒接好
  fanLowCurrent = currentPct >= FAN_CHECK_PCT && millis() - fanOnSince >= FAN_CHECK_DELAY_MS &&
                  currentMa < FAN_MIN_MA;
}

uint8_t statusFlags() {
  uint8_t f = 0;
  if (!inaFound) f |= FLAG_POWER_SENSOR_MISSING;
  if (overcurrentTripped) f |= FLAG_OVERCURRENT;
  if (fanLowCurrent) f |= FLAG_FAN_LOW_CURRENT;
  return f;
}

void putInt16(uint8_t* buf, int16_t v) {
  buf[0] = v & 0xFF;
  buf[1] = (v >> 8) & 0xFF;
}

void publishStatus() {
  uint8_t buf[10];
  putInt16(buf, isnan(tempC) ? INT16_MIN : (int16_t)lroundf(tempC * 10));
  buf[2] = currentPct;
  buf[3] = autoMode ? 1 : 0;
  buf[4] = manualPct;
  putInt16(buf + 5, (int16_t)constrain(lroundf(busMv), 0, 65535));  // uint16，以 int16 寫入相同位元
  putInt16(buf + 7, (int16_t)constrain(lroundf(currentMa), -32768, 32767));
  buf[9] = statusFlags();
  statusChar->setValue(buf, sizeof(buf));
  if (clientConnected) statusChar->notify();
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { clientConnected = true; }
  void onDisconnect(BLEServer*) override {
    clientConnected = false;
    BLEDevice::startAdvertising();  // 斷線後重新廣播，手機才能再連
  }
};

class ControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue();
    if (v.length() < 2) return;
    bool newAuto = v[0] != 0;
    if (newAuto != autoMode) autoFanOn = false;  // 切換模式時重新判斷遲滯狀態
    autoMode = newAuto;
    manualPct = constrain((uint8_t)v[1], 0, 100);
    controlChanged = true;  // 交給 loop() 處理，避免在 BLE 執行緒裡做太多事
  }
};

void setupBle() {
  BLEDevice::init(BLE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);

  statusChar = service->createCharacteristic(
      STATUS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->addDescriptor(new BLE2902());

  BLECharacteristic* controlChar = service->createCharacteristic(
      CONTROL_UUID, BLECharacteristic::PROPERTY_WRITE);
  controlChar->setCallbacks(new ControlCallbacks());

  BLECharacteristic* configChar = service->createCharacteristic(
      CONFIG_UUID, BLECharacteristic::PROPERTY_READ);
  uint8_t cfg[10];
  putInt16(cfg, (int16_t)lroundf(T_OFF * 10));
  putInt16(cfg + 2, (int16_t)lroundf(T_ON * 10));
  putInt16(cfg + 4, (int16_t)lroundf(T_MAX * 10));
  cfg[6] = DUTY_MIN;
  cfg[7] = SENSOR_FAIL_PCT;
  putInt16(cfg + 8, OVERCURRENT_MA);
  configChar->setValue(cfg, sizeof(cfg));

  service->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);  // 網頁用服務 UUID 篩選裝置
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void setup() {
  Serial.begin(115200);

  ledcAttach(PIN_FAN, PWM_FREQ, PWM_RES);
  ledcWrite(PIN_FAN, 0);

  sensors.begin();
  sensors.setWaitForConversion(false);  // 非阻塞讀溫度
  sensors.requestTemperatures();

  Wire.begin(PIN_SDA, PIN_SCL);
  inaFound = ina219.begin();
  if (inaFound) ina219.setCalibration_32V_2A();  // 0.1Ω 分流電阻，最大約 3.2A
  else Serial.println("找不到 INA219，電流感測停用（風扇仍正常運作）");

  setupBle();
  publishStatus();
  Serial.printf("BLE 廣播中：%s\n", BLE_NAME);
}

void loop() {
  if (controlChanged) {
    controlChanged = false;
    overcurrentTripped = false;  // 使用者重新下指令時解除過電流保護
    setFan(autoMode ? autoPercent(tempC) : manualPct);
    publishStatus();
  }

  sampleCurrent();

  if (millis() - lastTempMs >= 1000) {
    lastTempMs = millis();
    float t = sensors.getTempCByIndex(0);
    tempC = (t == DEVICE_DISCONNECTED_C) ? NAN : t;
    sensors.requestTemperatures();
    setFan(autoMode ? autoPercent(tempC) : manualPct);
    updatePowerAverage();
    publishStatus();
    Serial.printf("temp=%.1f pct=%d auto=%d V=%.2f I=%.0fmA flags=%u\n",
                  tempC, currentPct, autoMode, busMv / 1000, currentMa, statusFlags());
  }

  writeFan();
}
