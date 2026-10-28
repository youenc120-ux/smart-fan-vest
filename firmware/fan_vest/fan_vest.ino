// 溫控風扇背心 - ESP32（藍牙 BLE 版）
// 需要的函式庫（Arduino IDE 程式庫管理員安裝）：
//   DHT sensor library、Adafruit Unified Sensor、Adafruit INA219、Adafruit NeoPixel
// 開發板：ESP32 Dev Module，ESP32 core 3.x（BLE、Preferences 已內建）
// 手機控制頁：用 Android Chrome 開啟 GitHub Pages 上的 docs/index.html
//
// 接線：
//   GPIO25 -> 前胸 D4184 PWM、GPIO26 -> 後背 D4184 PWM（兩個模組 GND 都接 ESP32 GND）
//   GPIO4  -> DHT11 DATA（模組版已內建上拉；裸元件 DATA 與 3.3V 之間接 10kΩ）
//   GPIO21/22 -> INA219 SDA/SCL（VIN+ 接保險絲後的 +12V，VIN- 接風扇正極）
//   GPIO14 -> 主動式蜂鳴器、GPIO32 -> WS2812B DIN、GPIO33 -> 按鈕（另一端接 GND）
//   3V3 -> DHT11、INA219、WS2812B、蜂鳴器 VCC
//
// 按鈕：短按 = 自動 → 手動 30% → 60% → 100% → 關閉 → 自動；長按 1.5 秒 = 靜音警報並解除過電流保護
//
// BLE 資料格式（皆為 little-endian；第一次連線要輸入配對碼 BLE_PIN）：
//   STATUS   （讀取／通知，20 bytes）
//     0  int16  溫度×10（-32768 = 感測器異常）     2  uint8  濕度%（255 = 無資料）
//     3  int16  體感溫度×10（-32768 = 無資料）     5  uint8  前胸轉速%     6  uint8  後背轉速%
//     7  uint8  自動模式(1/0)                       8  uint8  手動前胸%      9  uint8  手動後背%
//     10 uint16 電壓 mV    12 int16 電流 mA    14 uint8 電量%（255 = 無資料）    15 uint8 狀態旗標（FLAG_*）
//     16 uint16 本次耗電 Wh×100                     18 uint16 開機分鐘數
//   CONTROL  （寫入，3 bytes）：uint8 自動模式、uint8 手動前胸%、uint8 手動後背%（也會靜音警報、解除過電流保護）
//   SETTINGS （讀取／寫入，11 bytes，存在 ESP32 記憶體，重開機不會消失）
//     0 int16 T0 停止溫度×10   2 int16 T1 啟動溫度×10   4 int16 T2 全速溫度×10   6 uint8 後背加強%
//     7 int16 中暑警示體感溫度×10   9 uint8 蜂鳴器(1/0)   10 uint8 依體感溫度控制(1/0)
//   CONFIG   （讀取，9 bytes）：uint8 最低轉速%、uint8 故障安全轉速%、uint16 過電流門檻 mA、
//                               uint16 電池空電壓 mV、uint16 電池滿電壓 mV、uint8 低電量轉速上限%

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <BLESecurity.h>
#include <Wire.h>
#include <Preferences.h>
#include <DHT.h>
#include <Adafruit_INA219.h>
#include <Adafruit_NeoPixel.h>

// ---- 感測器型號：換 DHT22 只要改這行，接線相同 ----
#define DHT_TYPE DHT11

// ---- 藍牙 ----
const char* BLE_NAME = "FanVest";
const bool BLE_USE_PIN = true;     // 改成 false 可關閉配對碼
const uint32_t BLE_PIN = 123456;   // 配對碼，請自行修改（6 位數）
#define SERVICE_UUID  "7a1e0001-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define STATUS_UUID   "7a1e0002-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONTROL_UUID  "7a1e0003-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONFIG_UUID   "7a1e0004-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define SETTINGS_UUID "7a1e0005-5c2b-4f0a-9d3e-6b8f2a4c9e10"

// ---- 腳位 ----
const int PIN_FAN_FRONT = 25;
const int PIN_FAN_BACK  = 26;
const int PIN_DHT       = 4;
const int PIN_SDA       = 21;
const int PIN_SCL       = 22;
const int PIN_BUZZER    = 14;
const int PIN_LED       = 32;
const int PIN_BUTTON    = 33;

// ---- PWM ----
const int PWM_FREQ = 20000;  // 20kHz 聽不到嗡嗡聲；風扇轉不順可改 1000 試試
const int PWM_RES  = 8;      // 0~255

// ---- 風扇參數 ----
const int DUTY_MIN = 30;           // 風扇能穩定轉動的最低轉速 %，實測後調整
const int SENSOR_FAIL_PCT = 70;    // 感測器故障時的轉速，寧可吹也不要停
const unsigned long KICK_MS = 500; // 從停止啟動時先全速轉一下，避免低速轉不起來

// ---- 溫度讀取 ----
const unsigned long DHT_INTERVAL_MS = 2000;  // DHT11/DHT22 讀太快會失敗
const int SMOOTH_N = 5;            // 取最近幾次平均，消除跳動
const int FAIL_LIMIT = 3;          // 連續失敗幾次才判定感測器故障

// ---- 電流保護（四顆風扇全速約 1~2A，請實測後調整） ----
const int OVERCURRENT_MA = 3000;           // 超過此電流視為短路或卡住，立即停止風扇
const unsigned long OVERCURRENT_MS = 300;  // 持續超過這麼久才跳脫，避免啟動瞬間誤判
const int FAN_MIN_MA = 80;                 // 風扇在轉卻低於此電流，視為風扇沒接好
const int FAN_CHECK_PCT = 50;              // 轉速達此值以上才檢查低電流
const unsigned long FAN_CHECK_DELAY_MS = 2000;

// ---- 電池（預設 3 串鋰電池；若電池輸出是穩壓 12V，電量顯示會不準，見 README） ----
const int BATT_EMPTY_MV = 10200;
const int BATT_FULL_MV  = 12600;
const int LOW_BATT_PCT = 20;        // 低於此電量進入省電模式
const int LOW_BATT_MAX_PCT = 70;    // 省電模式的轉速上限

// ---- 狀態旗標 ----
const uint8_t FLAG_POWER_SENSOR_MISSING = 0x01;  // 找不到 INA219
const uint8_t FLAG_OVERCURRENT          = 0x02;  // 過電流保護已跳脫，風扇停止
const uint8_t FLAG_FAN_LOW_CURRENT      = 0x04;  // 風扇電流過低，可能沒接好
const uint8_t FLAG_HEAT_ALERT           = 0x08;  // 體感溫度達中暑警示
const uint8_t FLAG_LOW_BATTERY          = 0x10;  // 低電量，已限制轉速
const uint8_t FLAG_ALARM_MUTED          = 0x20;  // 警報已被使用者靜音

// ---- 可由手機調整的設定（預設值） ----
struct Settings {
  float t0 = 26.0;         // 低於此溫度停止（DHT11 解析度 1°C，遲滯區至少留 2°C）
  float t1 = 28.0;         // 高於此溫度啟動
  float t2 = 35.0;         // 高於此溫度全速
  int backBoost = 10;      // 自動模式下後背比前胸多吹幾 %
  float heatAlert = 40.0;  // 體感溫度達此值發出中暑警示
  bool buzzer = true;
  bool useFeels = true;    // true = 依體感溫度控制，false = 依空氣溫度
};

DHT dht(PIN_DHT, DHT_TYPE);
Adafruit_INA219 ina219;
Adafruit_NeoPixel led(1, PIN_LED, NEO_GRB + NEO_KHZ800);
Preferences prefs;
BLECharacteristic* statusChar;
BLECharacteristic* settingsChar;

Settings cfg;
bool autoMode = true;
int manualFront = 50, manualBack = 50;
int pctFront = 0, pctBack = 0;
bool autoFanOn = false;
bool clientConnected = false;
volatile bool controlChanged = false, settingsChanged = false;

// 溫濕度
float tempBuf[SMOOTH_N], humBuf[SMOOTH_N];
int bufCount = 0, bufIdx = 0, failCount = FAIL_LIMIT;
float tempC = NAN, humidity = NAN, feelsC = NAN;
unsigned long lastDhtMs = 0, lastStatusMs = 0;

// 電源
bool inaFound = false;
float busMv = 0, currentMa = 0, sumMv = 0, sumMa = 0, energyWh = 0;
int samples = 0;
unsigned long lastSampleMs = 0, overSince = 0, fanOnSince = 0, kickUntil[2] = {0, 0};
bool overcurrentTripped = false, fanLowCurrent = false, lowBattery = false;
int batteryPct = -1;

// 警報
bool heatAlert = false, alarmMuted = false;
unsigned long lastHeatBeepMs = 0;

// 設定存檔（延遲寫入，減少快閃記憶體磨損）
bool prefsDirty = false;
unsigned long prefsDirtyMs = 0;

// ---------- 蜂鳴器（非阻塞） ----------
const uint16_t BEEP_CHIRP[] = {40};
const uint16_t BEEP_DOUBLE[] = {40, 80, 40};
const uint16_t BEEP_HEAT[] = {150, 100, 150, 100, 150};
const uint16_t BEEP_LOWBATT[] = {100, 100, 100};
const uint16_t BEEP_OVERCURRENT[] = {800};
const uint16_t* beepSeq = nullptr;
int beepLen = 0, beepIdx = 0;
unsigned long beepUntil = 0;

void beep(const uint16_t* seq, int len) {
  if (!cfg.buzzer) return;
  beepSeq = seq;
  beepLen = len;
  beepIdx = 0;
  beepUntil = millis() + seq[0];
  digitalWrite(PIN_BUZZER, HIGH);
}

void updateBuzzer() {
  if (!beepSeq || millis() < beepUntil) return;
  if (++beepIdx >= beepLen) {
    beepSeq = nullptr;
    digitalWrite(PIN_BUZZER, LOW);
    return;
  }
  digitalWrite(PIN_BUZZER, beepIdx % 2 == 0 ? HIGH : LOW);  // 偶數格響、奇數格停
  beepUntil = millis() + beepSeq[beepIdx];
}

// ---------- 設定存取 ----------
void loadSettings() {
  prefs.begin("fanvest", false);
  cfg.t0 = prefs.getFloat("t0", cfg.t0);
  cfg.t1 = prefs.getFloat("t1", cfg.t1);
  cfg.t2 = prefs.getFloat("t2", cfg.t2);
  cfg.backBoost = prefs.getInt("boost", cfg.backBoost);
  cfg.heatAlert = prefs.getFloat("heat", cfg.heatAlert);
  cfg.buzzer = prefs.getBool("buzzer", cfg.buzzer);
  cfg.useFeels = prefs.getBool("feels", cfg.useFeels);
  autoMode = prefs.getBool("auto", autoMode);
  manualFront = prefs.getInt("mf", manualFront);
  manualBack = prefs.getInt("mb", manualBack);
}

void markDirty() {
  prefsDirty = true;
  prefsDirtyMs = millis();
}

void savePrefsIfDue() {
  if (!prefsDirty || millis() - prefsDirtyMs < 3000) return;
  prefsDirty = false;
  prefs.putFloat("t0", cfg.t0);
  prefs.putFloat("t1", cfg.t1);
  prefs.putFloat("t2", cfg.t2);
  prefs.putInt("boost", cfg.backBoost);
  prefs.putFloat("heat", cfg.heatAlert);
  prefs.putBool("buzzer", cfg.buzzer);
  prefs.putBool("feels", cfg.useFeels);
  prefs.putBool("auto", autoMode);
  prefs.putInt("mf", manualFront);
  prefs.putInt("mb", manualBack);
}

// ---------- 溫濕度 ----------
void readDht() {
  if (millis() - lastDhtMs < DHT_INTERVAL_MS) return;
  lastDhtMs = millis();
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    if (failCount < FAIL_LIMIT) failCount++;
  } else {
    failCount = 0;
    tempBuf[bufIdx] = t;
    humBuf[bufIdx] = h;
    bufIdx = (bufIdx + 1) % SMOOTH_N;
    if (bufCount < SMOOTH_N) bufCount++;
  }
  if (failCount >= FAIL_LIMIT || bufCount == 0) {
    tempC = humidity = feelsC = NAN;
    return;
  }
  float st = 0, sh = 0;
  for (int i = 0; i < bufCount; i++) { st += tempBuf[i]; sh += humBuf[i]; }
  tempC = st / bufCount;
  humidity = sh / bufCount;
  feelsC = dht.computeHeatIndex(tempC, humidity, false);
}

// 控制依據：體感溫度或空氣溫度
float controlTemp() { return cfg.useFeels ? feelsC : tempC; }

// ---------- 風扇 ----------
int autoPercent(float t) {
  if (isnan(t)) return SENSOR_FAIL_PCT;
  if (!autoFanOn && t >= cfg.t1) autoFanOn = true;
  if (autoFanOn && t < cfg.t0) autoFanOn = false;
  if (!autoFanOn) return 0;
  if (t >= cfg.t2) return 100;
  float pct = DUTY_MIN + (t - cfg.t1) / (cfg.t2 - cfg.t1) * (100 - DUTY_MIN);
  return constrain((int)pct, DUTY_MIN, 100);
}

int limitPct(int pct) {
  if (overcurrentTripped) return 0;  // 過電流保護跳脫後維持停止，直到使用者重新下指令
  if (lowBattery) pct = min(pct, LOW_BATT_MAX_PCT);
  if (pct > 0 && pct < DUTY_MIN) pct = DUTY_MIN;
  return pct;
}

void applyFans() {
  int front, back;
  if (autoMode) {
    front = autoPercent(controlTemp());
    back = front > 0 ? min(100, front + cfg.backBoost) : 0;
  } else {
    front = manualFront;
    back = manualBack;
  }
  front = limitPct(front);
  back = limitPct(back);
  unsigned long now = millis();
  if (front > 0 && pctFront == 0) kickUntil[0] = now + KICK_MS;
  if (back > 0 && pctBack == 0) kickUntil[1] = now + KICK_MS;
  if ((front > 0 || back > 0) && pctFront == 0 && pctBack == 0) fanOnSince = now;
  pctFront = front;
  pctBack = back;
}

void writeFans() {
  unsigned long now = millis();
  int f = now < kickUntil[0] ? 100 : pctFront;
  int b = now < kickUntil[1] ? 100 : pctBack;
  ledcWrite(PIN_FAN_FRONT, f * 255 / 100);
  ledcWrite(PIN_FAN_BACK, b * 255 / 100);
}

// ---------- 電源 ----------
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
      applyFans();
      writeFans();
      beep(BEEP_OVERCURRENT, 1);
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
  energyWh += busMv / 1000 * max(0.0f, currentMa) / 1000 / 3600;  // 每秒累加一次

  fanLowCurrent = max(pctFront, pctBack) >= FAN_CHECK_PCT && millis() - fanOnSince >= FAN_CHECK_DELAY_MS &&
                  currentMa < FAN_MIN_MA;

  batteryPct = constrain(map((long)busMv, BATT_EMPTY_MV, BATT_FULL_MV, 0, 100), 0, 100);
  // 進入低電量要低於門檻，恢復要高於門檻 5%，避免負載變化讓狀態來回跳
  bool wasLow = lowBattery;
  if (!lowBattery && batteryPct < LOW_BATT_PCT) lowBattery = true;
  if (lowBattery && batteryPct >= LOW_BATT_PCT + 5) lowBattery = false;
  if (lowBattery && !wasLow) beep(BEEP_LOWBATT, 3);
}

// ---------- 中暑警示 ----------
void updateHeatAlert() {
  bool was = heatAlert;
  if (isnan(feelsC)) heatAlert = false;
  else if (!heatAlert && feelsC >= cfg.heatAlert) heatAlert = true;
  else if (heatAlert && feelsC < cfg.heatAlert - 1) heatAlert = false;
  if (!heatAlert) alarmMuted = false;
  if (heatAlert && !alarmMuted && (!was || millis() - lastHeatBeepMs >= 60000)) {
    lastHeatBeepMs = millis();
    beep(BEEP_HEAT, 5);
  }
}

// ---------- 狀態燈 ----------
uint32_t levelColor(float t) {
  if (isnan(t)) return led.Color(160, 0, 255);  // 感測器異常：紫色
  if (t < cfg.t1) return led.Color(0, 120, 255);
  if (t < (cfg.t1 + cfg.t2) / 2) return led.Color(255, 180, 0);
  if (t < cfg.t2) return led.Color(255, 90, 0);
  return led.Color(255, 0, 0);
}

void updateLed() {
  static unsigned long last = 0;
  if (millis() - last < 50) return;
  last = millis();
  unsigned long t = millis();
  uint32_t c;
  if (overcurrentTripped) c = (t / 125) % 2 ? led.Color(255, 0, 0) : 0;           // 快閃紅
  else if (heatAlert) c = (t / 500) % 2 ? led.Color(255, 0, 0) : 0;               // 慢閃紅
  else if (lowBattery && (t / 1000) % 4 == 0) c = led.Color(255, 160, 0);         // 每 4 秒閃一下黃
  else if (!autoMode) c = led.Color(180, 180, 180);                               // 手動：白
  else c = levelColor(controlTemp());                                             // 自動：依溫度變色
  led.setPixelColor(0, c);
  led.show();
}

// ---------- 按鈕 ----------
void handleButtonAction(bool longPress) {
  if (longPress) {
    alarmMuted = heatAlert;
    overcurrentTripped = false;
    beep(BEEP_DOUBLE, 3);
  } else {
    // 自動 → 手動 30% → 60% → 100% → 關閉 → 自動
    static const int STEPS[] = {30, 60, 100, 0};
    static int step = -1;
    if (autoMode) {
      autoMode = false;
      step = 0;
    } else if (++step >= 4) {
      autoMode = true;
      autoFanOn = false;
      step = -1;
    }
    if (!autoMode) manualFront = manualBack = STEPS[step];
    beep(BEEP_CHIRP, 1);
    markDirty();
  }
  applyFans();
  publishStatus();
}

void updateButton() {
  static bool lastRaw = HIGH, stable = HIGH, longFired = false;
  static unsigned long changedMs = 0, pressedMs = 0;
  bool raw = digitalRead(PIN_BUTTON);
  if (raw != lastRaw) {
    lastRaw = raw;
    changedMs = millis();
  }
  if (millis() - changedMs < 30) return;  // 去彈跳
  if (raw != stable) {
    stable = raw;
    if (stable == LOW) {
      pressedMs = millis();
      longFired = false;
    } else if (!longFired) {
      handleButtonAction(false);
    }
  }
  if (stable == LOW && !longFired && millis() - pressedMs >= 1500) {
    longFired = true;
    handleButtonAction(true);
  }
}

// ---------- BLE ----------
void putInt16(uint8_t* buf, int16_t v) {
  buf[0] = v & 0xFF;
  buf[1] = (v >> 8) & 0xFF;
}
int16_t getInt16(const uint8_t* buf) { return (int16_t)(buf[0] | (buf[1] << 8)); }
int16_t tenths(float v) { return isnan(v) ? INT16_MIN : (int16_t)lroundf(v * 10); }

uint8_t statusFlags() {
  uint8_t f = 0;
  if (!inaFound) f |= FLAG_POWER_SENSOR_MISSING;
  if (overcurrentTripped) f |= FLAG_OVERCURRENT;
  if (fanLowCurrent) f |= FLAG_FAN_LOW_CURRENT;
  if (heatAlert) f |= FLAG_HEAT_ALERT;
  if (lowBattery) f |= FLAG_LOW_BATTERY;
  if (alarmMuted) f |= FLAG_ALARM_MUTED;
  return f;
}

void publishStatus() {
  uint8_t b[20];
  putInt16(b, tenths(tempC));
  b[2] = isnan(humidity) ? 255 : (uint8_t)lroundf(humidity);
  putInt16(b + 3, tenths(feelsC));
  b[5] = pctFront;
  b[6] = pctBack;
  b[7] = autoMode ? 1 : 0;
  b[8] = manualFront;
  b[9] = manualBack;
  putInt16(b + 10, (int16_t)constrain(lroundf(busMv), 0, 65535));  // uint16，以 int16 寫入相同位元
  putInt16(b + 12, (int16_t)constrain(lroundf(currentMa), -32768, 32767));
  b[14] = inaFound && batteryPct >= 0 ? batteryPct : 255;
  b[15] = statusFlags();
  putInt16(b + 16, (int16_t)constrain(lroundf(energyWh * 100), 0, 65535));
  putInt16(b + 18, (int16_t)min(millis() / 60000UL, 65535UL));
  statusChar->setValue(b, sizeof(b));
  if (clientConnected) statusChar->notify();
}

void publishSettings() {
  uint8_t b[11];
  putInt16(b, tenths(cfg.t0));
  putInt16(b + 2, tenths(cfg.t1));
  putInt16(b + 4, tenths(cfg.t2));
  b[6] = cfg.backBoost;
  putInt16(b + 7, tenths(cfg.heatAlert));
  b[9] = cfg.buzzer ? 1 : 0;
  b[10] = cfg.useFeels ? 1 : 0;
  settingsChar->setValue(b, sizeof(b));
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
    if (v.length() < 3) return;
    bool newAuto = v[0] != 0;
    if (newAuto != autoMode) autoFanOn = false;  // 切換模式時重新判斷遲滯狀態
    autoMode = newAuto;
    manualFront = constrain((uint8_t)v[1], 0, 100);
    manualBack = constrain((uint8_t)v[2], 0, 100);
    controlChanged = true;  // 交給 loop() 處理，避免在 BLE 執行緒裡做太多事
  }
};

class SettingsCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue();
    if (v.length() < 11) return;
    const uint8_t* b = (const uint8_t*)v.c_str();
    float t0 = getInt16(b) / 10.0, t1 = getInt16(b + 2) / 10.0, t2 = getInt16(b + 4) / 10.0;
    float heat = getInt16(b + 7) / 10.0;
    // 不合理的設定直接忽略，手機會讀回目前的設定
    if (t0 >= 15 && t0 < t1 && t1 < t2 && t2 <= 45 && heat >= 30 && heat <= 55 && b[6] <= 50) {
      cfg.t0 = t0;
      cfg.t1 = t1;
      cfg.t2 = t2;
      cfg.backBoost = b[6];
      cfg.heatAlert = heat;
      cfg.buzzer = b[9] != 0;
      cfg.useFeels = b[10] != 0;
    }
    settingsChanged = true;
  }
};

void setupBle() {
  BLEDevice::init(BLE_NAME);
  uint16_t readPerm = ESP_GATT_PERM_READ, writePerm = ESP_GATT_PERM_WRITE;
  if (BLE_USE_PIN) {
    BLESecurity* security = new BLESecurity();
    security->setPassKey(true, BLE_PIN);
    security->setCapability(ESP_IO_CAP_OUT);           // 手機輸入 ESP32 的固定配對碼
    security->setAuthenticationMode(true, true, true);  // 綁定、MITM 保護、Secure Connections
    readPerm = ESP_GATT_PERM_READ_ENC_MITM;
    writePerm = ESP_GATT_PERM_WRITE_ENC_MITM;
  }

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);

  statusChar = service->createCharacteristic(
      STATUS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->setAccessPermissions(readPerm);
  BLE2902* cccd = new BLE2902();
  cccd->setAccessPermissions(readPerm | writePerm);
  statusChar->addDescriptor(cccd);

  BLECharacteristic* controlChar = service->createCharacteristic(CONTROL_UUID, BLECharacteristic::PROPERTY_WRITE);
  controlChar->setAccessPermissions(writePerm);
  controlChar->setCallbacks(new ControlCallbacks());

  settingsChar = service->createCharacteristic(
      SETTINGS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  settingsChar->setAccessPermissions(readPerm | writePerm);
  settingsChar->setCallbacks(new SettingsCallbacks());
  publishSettings();

  BLECharacteristic* configChar = service->createCharacteristic(CONFIG_UUID, BLECharacteristic::PROPERTY_READ);
  configChar->setAccessPermissions(readPerm);
  uint8_t c[9];
  c[0] = DUTY_MIN;
  c[1] = SENSOR_FAIL_PCT;
  putInt16(c + 2, OVERCURRENT_MA);
  putInt16(c + 4, BATT_EMPTY_MV);
  putInt16(c + 6, (int16_t)BATT_FULL_MV);
  c[8] = LOW_BATT_MAX_PCT;
  configChar->setValue(c, sizeof(c));

  service->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);  // 網頁用服務 UUID 篩選裝置
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void setup() {
  Serial.begin(115200);

  ledcAttach(PIN_FAN_FRONT, PWM_FREQ, PWM_RES);
  ledcAttach(PIN_FAN_BACK, PWM_FREQ, PWM_RES);
  ledcWrite(PIN_FAN_FRONT, 0);
  ledcWrite(PIN_FAN_BACK, 0);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  led.begin();
  led.setBrightness(40);  // 太亮會刺眼也耗電
  led.show();

  loadSettings();
  dht.begin();

  Wire.begin(PIN_SDA, PIN_SCL);
  inaFound = ina219.begin();
  if (inaFound) ina219.setCalibration_32V_2A();  // 0.1Ω 分流電阻，最大約 3.2A
  else Serial.println("找不到 INA219，電流感測停用（風扇仍正常運作）");

  setupBle();
  publishStatus();
  beep(BEEP_CHIRP, 1);
  Serial.printf("BLE 廣播中：%s（配對碼 %s）\n", BLE_NAME, BLE_USE_PIN ? String(BLE_PIN).c_str() : "關閉");
}

void loop() {
  if (controlChanged) {
    controlChanged = false;
    overcurrentTripped = false;  // 使用者重新下指令時解除過電流保護
    alarmMuted = heatAlert;      // 也當作已確認中暑警示
    applyFans();
    publishStatus();
    markDirty();
  }
  if (settingsChanged) {
    settingsChanged = false;
    autoFanOn = false;
    publishSettings();
    applyFans();
    markDirty();
  }

  readDht();
  sampleCurrent();
  updateButton();

  if (millis() - lastStatusMs >= 1000) {
    lastStatusMs = millis();
    updatePowerAverage();
    updateHeatAlert();
    applyFans();
    publishStatus();
    Serial.printf("T=%.1f H=%.0f feels=%.1f front=%d back=%d auto=%d V=%.2f I=%.0fmA batt=%d flags=0x%02X\n",
                  tempC, humidity, feelsC, pctFront, pctBack, autoMode, busMv / 1000, currentMa, batteryPct,
                  statusFlags());
  }

  writeFans();
  updateBuzzer();
  updateLed();
  savePrefsIfDue();
}
