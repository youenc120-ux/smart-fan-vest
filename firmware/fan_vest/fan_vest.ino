// 溫控風扇背心 - ESP32（藍牙 BLE 版）
// 需要的函式庫（Arduino IDE 程式庫管理員安裝）：
//   DHT sensor library、Adafruit Unified Sensor、Adafruit INA219、Adafruit NeoPixel
// 開發板：ESP32 Dev Module，ESP32 core 3.x（BLE、Preferences 已內建）
// 手機控制頁：用 Android Chrome 開啟 GitHub Pages 上的 docs/index.html
//
// 接線：
//   GPIO25 -> 上方 D4184 PWM、GPIO26 -> 下方 D4184 PWM（兩個模組 GND 都接 ESP32 GND）
//   GPIO4  -> DHT11 DATA（模組版已內建上拉；裸元件 DATA 與 3.3V 之間接 10kΩ）
//   GPIO21/22 -> INA219 SDA/SCL（VIN+ 接保險絲後的 +12V，VIN- 接風扇正極）
//   GPIO14 -> 主動式蜂鳴器、GPIO32 -> WS2812B DIN、GPIO33 -> 按鈕（另一端接 GND）
//   3V3 -> DHT11、INA219、WS2812B、蜂鳴器 VCC
//
// 按鈕：短按 = 自動 → 手動 30% → 60% → 100% → 關閉 → 自動；連按兩下 = 切換情境模式；
//       長按 1.5 秒 = 靜音警報並解除過電流保護；開機時按住按鈕 = 進入無線更新（OTA）模式
//
// 分檔：fan_vest.ino（主程式、BLE）、features.ino（情境模式、喝水提醒、偏好學習、開機自我檢測）、ota.ino（無線更新）
// 燒錄設定：Partition Scheme 選「Minimal SPIFFS (1.9MB APP with OTA)」，程式才放得下
//
// BLE 資料格式（皆為 little-endian；第一次連線要輸入配對碼 BLE_PIN）：
//   STATUS   （讀取／通知，20 bytes）
//     0  int16  溫度×10（-32768 = 感測器異常）     2  uint8  濕度%（255 = 無資料）
//     3  int16  體感溫度×10（-32768 = 無資料）     5  uint8  上方轉速%     6  uint8  下方轉速%
//     7  uint8  自動模式(1/0)                       8  uint8  手動上方%      9  uint8  手動下方%
//     10 uint16 電壓 mV    12 int16 電流 mA    14 uint8 電量%（255 = 無資料）    15 uint8 狀態旗標（FLAG_*）
//     16 uint16 本次耗電 Wh×100                     18 uint16 開機分鐘數
//   CONTROL  （寫入，3～4 bytes）：uint8 自動模式、uint8 手動上方%、uint8 手動下方%（也會靜音警報、解除過電流保護）、
//                                  uint8 指令（可省略；CMD_*：0～4 = 套用情境模式、254 自我檢測、253 進入 OTA、252 清除學習）
//   SETTINGS （讀取／寫入，16 bytes，存在 ESP32 記憶體，重開機不會消失）
//     0 int16 T0 停止溫度×10   2 int16 T1 啟動溫度×10   4 int16 T2 全速溫度×10   6 uint8 下方加強%
//     7 int16 中暑警示體感溫度×10   9 uint8 蜂鳴器(1/0)   10 uint8 依體感溫度控制(1/0)
//     11 uint8 最高轉速上限%   12 int16 喝水提醒體感溫度×10   14 uint8 喝水提醒間隔（分）   15 uint8 偏好學習(1/0)
//   EXTRA    （讀取／通知，16 bytes）
//     0  uint8  旗標（EXTRA_*）          1  uint16 連續高溫分鐘數     3  uint16 本次累積高溫分鐘數
//     5  uint8  情境模式                 6  uint16 自我檢測上方 mA    8  uint16 自我檢測下方 mA（0xFFFF = 未測）
//     10 uint8  韌體主版本  11 uint8 次版本   12 int16 學習偏移×10（°C，負值 = 提早啟動）   14 uint8 學習樣本數
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

// ---- 版本 ----
const uint8_t FW_MAJOR = 1, FW_MINOR = 0;

// ---- 藍牙（名稱會加上晶片編號後 4 碼，例如 FanVest-3A7F，團隊模式才分得出誰是誰） ----
const char* BLE_NAME = "FanVest";
const bool BLE_USE_PIN = true;     // 改成 false 可關閉配對碼
const uint32_t BLE_PIN = 123456;   // 配對碼，請自行修改（6 位數）
#define SERVICE_UUID  "7a1e0001-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define STATUS_UUID   "7a1e0002-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONTROL_UUID  "7a1e0003-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define CONFIG_UUID   "7a1e0004-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define SETTINGS_UUID "7a1e0005-5c2b-4f0a-9d3e-6b8f2a4c9e10"
#define EXTRA_UUID    "7a1e0006-5c2b-4f0a-9d3e-6b8f2a4c9e10"

// ---- 腳位 ----
const int PIN_FAN_UPPER = 25;
const int PIN_FAN_LOWER  = 26;
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
const float RAMP_PCT_PER_S = 60;   // 平滑調速：每秒最多改變幾 %，避免風聲突然變大

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

// ---- EXTRA 旗標 ----
const uint8_t EXTRA_HYDRATE   = 0x01;  // 該喝水了（使用者確認前持續）
const uint8_t EXTRA_REST      = 0x02;  // 連續高溫太久，建議休息
const uint8_t EXTRA_SELF_TEST = 0x04;  // 自我檢測進行中
const uint8_t EXTRA_UPPER_OK  = 0x08;  // 自我檢測：上方風扇電流正常
const uint8_t EXTRA_LOWER_OK  = 0x10;  // 自我檢測：下方風扇電流正常
const uint8_t EXTRA_TESTED    = 0x20;  // 自我檢測已完成（搭配上兩項判斷結果）

// ---- 情境模式、按鈕動作與手機指令（型別要在任何函式之前宣告） ----
enum Profile { PROFILE_CUSTOM, PROFILE_OUTDOOR, PROFILE_SPORT, PROFILE_QUIET, PROFILE_ECO, PROFILE_COUNT };
enum ButtonAction { BTN_SHORT, BTN_LONG, BTN_DOUBLE };
const int CMD_SELF_TEST = 254, CMD_OTA = 253, CMD_RESET_LEARNING = 252;

// ---- 可由手機調整的設定（預設值） ----
struct Settings {
  float t0 = 26.0;         // 低於此溫度停止（DHT11 解析度 1°C，遲滯區至少留 2°C）
  float t1 = 28.0;         // 高於此溫度啟動
  float t2 = 35.0;         // 高於此溫度全速
  int lowerBoost = 10;      // 自動模式時，下方比上方多吹幾 %
  float heatAlert = 40.0;  // 體感溫度達此值發出中暑警示
  bool buzzer = true;
  bool useFeels = true;    // true = 依體感溫度控制，false = 依空氣溫度
  int maxPct = 100;        // 最高轉速上限（安靜、省電情境會降低）
  float hydrateFeels = 32; // 體感溫度高於此值開始累計高溫時間
  int hydrateMin = 20;     // 每連續高溫幾分鐘提醒喝水一次
  bool learn = true;       // 依手動調整紀錄自動微調溫度門檻
  int profile = 0;         // 目前的情境模式（PROFILE_*）
};

DHT dht(PIN_DHT, DHT_TYPE);
Adafruit_INA219 ina219;
Adafruit_NeoPixel led(1, PIN_LED, NEO_GRB + NEO_KHZ800);
Preferences prefs;
BLECharacteristic* statusChar;
BLECharacteristic* settingsChar;
BLECharacteristic* extraChar;
String deviceName;

Settings cfg;
bool autoMode = true;
int manualUpper = 50, manualLower = 50;
int pctUpper = 0, pctLower = 0;
bool autoFanOn = false;
bool clientConnected = false;
volatile bool controlChanged = false, settingsChanged = false;
volatile int pendingCmd = -1;      // CONTROL 第 4 byte 的指令，交給 loop() 處理
float outUpper = 0, outLower = 0;  // 平滑後實際輸出的轉速 %
unsigned long lastRampMs = 0;

// 偏好學習（features.ino 更新）：溫度門檻的偏移量與樣本數
float learnShift = 0;
int learnSamples = 0;
bool hydrateDue = false;  // 喝水提醒（features.ino 更新）

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
  cfg.lowerBoost = prefs.getInt("boost", cfg.lowerBoost);
  cfg.heatAlert = prefs.getFloat("heat", cfg.heatAlert);
  cfg.buzzer = prefs.getBool("buzzer", cfg.buzzer);
  cfg.useFeels = prefs.getBool("feels", cfg.useFeels);
  cfg.maxPct = prefs.getInt("max", cfg.maxPct);
  cfg.hydrateFeels = prefs.getFloat("hyd", cfg.hydrateFeels);
  cfg.hydrateMin = prefs.getInt("hydmin", cfg.hydrateMin);
  cfg.learn = prefs.getBool("learn", cfg.learn);
  cfg.profile = prefs.getInt("prof", cfg.profile);
  autoMode = prefs.getBool("auto", autoMode);
  manualUpper = prefs.getInt("mf", manualUpper);
  manualLower = prefs.getInt("mb", manualLower);
  loadLearning();
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
  prefs.putInt("boost", cfg.lowerBoost);
  prefs.putFloat("heat", cfg.heatAlert);
  prefs.putBool("buzzer", cfg.buzzer);
  prefs.putBool("feels", cfg.useFeels);
  prefs.putInt("max", cfg.maxPct);
  prefs.putFloat("hyd", cfg.hydrateFeels);
  prefs.putInt("hydmin", cfg.hydrateMin);
  prefs.putBool("learn", cfg.learn);
  prefs.putInt("prof", cfg.profile);
  prefs.putBool("auto", autoMode);
  prefs.putInt("mf", manualUpper);
  prefs.putInt("mb", manualLower);
  saveLearning();
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
// 自動曲線：門檻加上偏好學習的偏移（learnShift，負值 = 提早啟動）
int autoPercent(float t) {
  if (isnan(t)) return SENSOR_FAIL_PCT;
  float t0 = cfg.t0 + learnShift, t1 = cfg.t1 + learnShift, t2 = cfg.t2 + learnShift;
  if (!autoFanOn && t >= t1) autoFanOn = true;
  if (autoFanOn && t < t0) autoFanOn = false;
  if (!autoFanOn) return 0;
  if (t >= t2) return 100;
  float pct = DUTY_MIN + (t - t1) / (t2 - t1) * (100 - DUTY_MIN);
  return constrain((int)pct, DUTY_MIN, 100);
}

int limitPct(int pct) {
  if (overcurrentTripped) return 0;  // 過電流保護跳脫後維持停止，直到使用者重新下指令
  pct = min(pct, cfg.maxPct);
  if (lowBattery) pct = min(pct, LOW_BATT_MAX_PCT);
  if (pct > 0 && pct < DUTY_MIN) pct = DUTY_MIN;
  return pct;
}

void applyFans() {
  int upper, lower;
  if (autoMode) {
    upper = autoPercent(controlTemp());
    lower = upper > 0 ? min(100, upper + cfg.lowerBoost) : 0;
  } else {
    upper = manualUpper;
    lower = manualLower;
  }
  upper = limitPct(upper);
  lower = limitPct(lower);
  unsigned long now = millis();
  if (upper > 0 && pctUpper == 0) kickUntil[0] = now + KICK_MS;
  if (lower > 0 && pctLower == 0) kickUntil[1] = now + KICK_MS;
  if ((upper > 0 || lower > 0) && pctUpper == 0 && pctLower == 0) fanOnSince = now;
  pctUpper = upper;
  pctLower = lower;
}

// 平滑調速：實際輸出慢慢靠近目標；啟動瞬間、停止與過電流則立即反應
float rampToward(float out, int target, float step) {
  if (target == 0 || out == 0 || overcurrentTripped) return target;
  if (out < target) return min(out + step, (float)target);
  return max(out - step, (float)target);
}

void writeFans() {
  if (selfTestActive()) return;  // 自我檢測期間由 features.ino 直接控制輸出
  unsigned long now = millis();
  float step = RAMP_PCT_PER_S * (now - lastRampMs) / 1000.0;
  lastRampMs = now;
  outUpper = rampToward(outUpper, pctUpper, step);
  outLower = rampToward(outLower, pctLower, step);
  float u = now < kickUntil[0] ? 100 : outUpper;
  float l = now < kickUntil[1] ? 100 : outLower;
  ledcWrite(PIN_FAN_UPPER, (int)(u * 255 / 100));
  ledcWrite(PIN_FAN_LOWER, (int)(l * 255 / 100));
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

  fanLowCurrent = max(pctUpper, pctLower) >= FAN_CHECK_PCT && millis() - fanOnSince >= FAN_CHECK_DELAY_MS &&
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
  else if (hydrateDue) c = (t / 300) % 2 ? led.Color(0, 200, 255) : 0;            // 閃青色：該喝水了
  else if (selfTestActive()) c = led.Color(0, 255, 0);                            // 自我檢測中：綠
  else if (lowBattery && (t / 1000) % 4 == 0) c = led.Color(255, 160, 0);         // 每 4 秒閃一下黃
  else if (!autoMode) c = led.Color(180, 180, 180);                               // 手動：白
  else c = levelColor(controlTemp());                                             // 自動：依溫度變色
  led.setPixelColor(0, c);
  led.show();
}

// ---------- 按鈕 ----------
void handleButtonAction(ButtonAction action) {
  if (action == BTN_LONG) {
    alarmMuted = heatAlert;
    overcurrentTripped = false;
    acknowledgeHydrate();
    beep(BEEP_DOUBLE, 3);
  } else if (action == BTN_DOUBLE) {
    applyProfile((cfg.profile + 1) % PROFILE_COUNT);
    for (int i = 0; i <= cfg.profile; i++) beep(BEEP_CHIRP, 1);  // 只會聽到一聲，燈號與手機會顯示目前情境
    publishSettings();
    markDirty();
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
    if (!autoMode) manualUpper = manualLower = STEPS[step];
    beep(BEEP_CHIRP, 1);
    markDirty();
  }
  applyFans();
  publishStatus();
}

// 短按要等 350ms 確認不是連按兩下才執行
void updateButton() {
  static bool lastRaw = HIGH, stable = HIGH, longFired = false, pendingShort = false;
  static unsigned long changedMs = 0, pressedMs = 0, releasedMs = 0;
  const unsigned long DOUBLE_MS = 350;
  bool raw = digitalRead(PIN_BUTTON);
  if (raw != lastRaw) {
    lastRaw = raw;
    changedMs = millis();
  }
  if (pendingShort && stable == HIGH && millis() - releasedMs >= DOUBLE_MS) {
    pendingShort = false;
    handleButtonAction(BTN_SHORT);
  }
  if (millis() - changedMs < 30) return;  // 去彈跳
  if (raw != stable) {
    stable = raw;
    if (stable == LOW) {
      pressedMs = millis();
      longFired = false;
    } else if (!longFired) {
      if (pendingShort && millis() - releasedMs < DOUBLE_MS) {
        pendingShort = false;
        handleButtonAction(BTN_DOUBLE);
      } else {
        pendingShort = true;
        releasedMs = millis();
      }
    }
  }
  if (stable == LOW && !longFired && millis() - pressedMs >= 1500) {
    longFired = true;
    pendingShort = false;
    handleButtonAction(BTN_LONG);
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
  b[5] = pctUpper;
  b[6] = pctLower;
  b[7] = autoMode ? 1 : 0;
  b[8] = manualUpper;
  b[9] = manualLower;
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
  uint8_t b[16];
  putInt16(b, tenths(cfg.t0));
  putInt16(b + 2, tenths(cfg.t1));
  putInt16(b + 4, tenths(cfg.t2));
  b[6] = cfg.lowerBoost;
  putInt16(b + 7, tenths(cfg.heatAlert));
  b[9] = cfg.buzzer ? 1 : 0;
  b[10] = cfg.useFeels ? 1 : 0;
  b[11] = cfg.maxPct;
  putInt16(b + 12, tenths(cfg.hydrateFeels));
  b[14] = cfg.hydrateMin;
  b[15] = cfg.learn ? 1 : 0;
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
    manualUpper = constrain((uint8_t)v[1], 0, 100);
    manualLower = constrain((uint8_t)v[2], 0, 100);
    if (v.length() >= 4 && (uint8_t)v[3] != 255) pendingCmd = (uint8_t)v[3];
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
      cfg.lowerBoost = b[6];
      cfg.heatAlert = heat;
      cfg.buzzer = b[9] != 0;
      cfg.useFeels = b[10] != 0;
      cfg.profile = PROFILE_CUSTOM;  // 手動改設定就變成自訂情境
    }
    if (v.length() >= 16) {
      float hyd = getInt16(b + 12) / 10.0;
      if (b[11] >= DUTY_MIN && b[11] <= 100) cfg.maxPct = b[11];
      if (hyd >= 25 && hyd <= 45) cfg.hydrateFeels = hyd;
      if (b[14] >= 5 && b[14] <= 120) cfg.hydrateMin = b[14];
      cfg.learn = b[15] != 0;
    }
    settingsChanged = true;
  }
};

void setupBle() {
  char suffix[6];
  snprintf(suffix, sizeof(suffix), "%04X", (uint16_t)(ESP.getEfuseMac() >> 32));  // 晶片 MAC 後 4 碼
  deviceName = String(BLE_NAME) + "-" + suffix;
  BLEDevice::init(deviceName.c_str());
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

  extraChar = service->createCharacteristic(
      EXTRA_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  extraChar->setAccessPermissions(readPerm);
  BLE2902* extraCccd = new BLE2902();
  extraCccd->setAccessPermissions(readPerm | writePerm);
  extraChar->addDescriptor(extraCccd);
  publishExtra();

  service->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);  // 網頁用服務 UUID 篩選裝置
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void setup() {
  Serial.begin(115200);

  ledcAttach(PIN_FAN_UPPER, PWM_FREQ, PWM_RES);
  ledcAttach(PIN_FAN_LOWER, PWM_FREQ, PWM_RES);
  ledcWrite(PIN_FAN_UPPER, 0);
  ledcWrite(PIN_FAN_LOWER, 0);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  led.begin();
  led.setBrightness(40);  // 太亮會刺眼也耗電
  led.show();

  loadSettings();

  // 開機時按住按鈕：進入無線更新模式（不啟動藍牙，風扇保持停止）
  if (digitalRead(PIN_BUTTON) == LOW) {
    delay(50);
    if (digitalRead(PIN_BUTTON) == LOW) startOta();
  }

  dht.begin();

  Wire.begin(PIN_SDA, PIN_SCL);
  inaFound = ina219.begin();
  if (inaFound) ina219.setCalibration_32V_2A();  // 0.1Ω 分流電阻，最大約 3.2A
  else Serial.println("找不到 INA219，電流感測停用（風扇仍正常運作）");

  setupBle();
  publishStatus();
  beep(BEEP_CHIRP, 1);
  startSelfTest();
  Serial.printf("FanVest 韌體 %d.%d，BLE 廣播中：%s（配對碼 %s）\n", FW_MAJOR, FW_MINOR, deviceName.c_str(),
                BLE_USE_PIN ? String(BLE_PIN).c_str() : "關閉");
}

// 手機透過 CONTROL 第 4 byte 送來的指令
void handleCommand(int cmd) {
  if (cmd >= 0 && cmd < PROFILE_COUNT) {
    applyProfile(cmd);
    publishSettings();
    markDirty();
  } else if (cmd == CMD_SELF_TEST) {
    startSelfTest();
  } else if (cmd == CMD_OTA) {
    savePrefsIfDue();
    startOta();
  } else if (cmd == CMD_RESET_LEARNING) {
    resetLearning();
  }
}

void loop() {
  if (otaActive()) {  // 無線更新模式只處理網頁上傳
    otaLoop();
    return;
  }
  if (controlChanged) {
    controlChanged = false;
    overcurrentTripped = false;  // 使用者重新下指令時解除過電流保護
    alarmMuted = heatAlert;      // 也當作已確認中暑警示
    acknowledgeHydrate();
    noteManualChange();          // 偏好學習：記錄手動調整
    if (pendingCmd >= 0) {
      int cmd = pendingCmd;
      pendingCmd = -1;
      handleCommand(cmd);
    }
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
    updateHydration();
    updateLearning();
    applyFans();
    publishStatus();
    publishExtra();
    Serial.printf("T=%.1f H=%.0f feels=%.1f upper=%d lower=%d auto=%d V=%.2f I=%.0fmA batt=%d flags=0x%02X\n",
                  tempC, humidity, feelsC, pctUpper, pctLower, autoMode, busMv / 1000, currentMa, batteryPct,
                  statusFlags());
  }

  updateSelfTest();
  writeFans();
  updateBuzzer();
  updateLed();
  savePrefsIfDue();
}
