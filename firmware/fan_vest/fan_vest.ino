// 溫控風扇背心 - ESP32（藍牙 BLE 版）
// 需要的函式庫（Arduino IDE 程式庫管理員安裝）：OneWire、DallasTemperature
// 開發板：ESP32 Dev Module，ESP32 core 3.x（BLE 函式庫已內建）
// 手機控制頁：用 Android Chrome 開啟 GitHub Pages 上的 docs/index.html
//
// 接線：
//   GPIO25 -> MOSFET 模組 PWM/TRIG，ESP32 GND -> 模組 GND
//   GPIO4  -> DS18B20 DATA（DATA 與 3.3V 之間接 4.7kΩ，模組版通常已內建）
//   DS18B20 VCC -> 3.3V，GND -> GND
//
// BLE 資料格式（皆為 little-endian）：
//   STATUS  （讀取／通知，5 bytes）：int16 溫度×10（-32768 = 感測器異常）、uint8 目前轉速%、uint8 自動模式(1/0)、uint8 手動設定%
//   CONTROL （寫入，2 bytes）     ：uint8 自動模式(1/0)、uint8 手動設定%
//   CONFIG  （讀取，8 bytes）     ：int16 T0×10、int16 T1×10、int16 T2×10、uint8 最低轉速%、uint8 故障安全轉速%

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---- 藍牙 ----
const char* BLE_NAME = "FanVest";
#define SERVICE_UUID "7a1e0001-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define STATUS_UUID  "7a1e0002-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONTROL_UUID "7a1e0003-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONFIG_UUID  "7a1e0004-5c2b-4f0a-9d3e-6b8f2a4c9e10"

// ---- 腳位 ----
const int PIN_FAN  = 25;
const int PIN_TEMP = 4;

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

OneWire oneWire(PIN_TEMP);
DallasTemperature sensors(&oneWire);
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
  if (pct > 0 && pct < DUTY_MIN) pct = DUTY_MIN;
  if (pct > 0 && currentPct == 0) kickUntil = millis() + KICK_MS;
  currentPct = pct;
}

void writeFan() {
  int pct = (millis() < kickUntil) ? 100 : currentPct;
  ledcWrite(PIN_FAN, pct * 255 / 100);
}

void putInt16(uint8_t* buf, int16_t v) {
  buf[0] = v & 0xFF;
  buf[1] = (v >> 8) & 0xFF;
}

void publishStatus() {
  uint8_t buf[5];
  putInt16(buf, isnan(tempC) ? INT16_MIN : (int16_t)lroundf(tempC * 10));
  buf[2] = currentPct;
  buf[3] = autoMode ? 1 : 0;
  buf[4] = manualPct;
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
  uint8_t cfg[8];
  putInt16(cfg, (int16_t)lroundf(T_OFF * 10));
  putInt16(cfg + 2, (int16_t)lroundf(T_ON * 10));
  putInt16(cfg + 4, (int16_t)lroundf(T_MAX * 10));
  cfg[6] = DUTY_MIN;
  cfg[7] = SENSOR_FAIL_PCT;
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

  setupBle();
  publishStatus();
  Serial.printf("BLE 廣播中：%s\n", BLE_NAME);
}

void loop() {
  if (controlChanged) {
    controlChanged = false;
    setFan(autoMode ? autoPercent(tempC) : manualPct);
    publishStatus();
  }

  if (millis() - lastTempMs >= 1000) {
    lastTempMs = millis();
    float t = sensors.getTempCByIndex(0);
    tempC = (t == DEVICE_DISCONNECTED_C) ? NAN : t;
    sensors.requestTemperatures();
    setFan(autoMode ? autoPercent(tempC) : manualPct);
    publishStatus();
    Serial.printf("temp=%.1f pct=%d auto=%d\n", tempC, currentPct, autoMode);
  }

  writeFan();
}
