// 進階功能：情境模式、喝水／休息提醒、偏好學習、開機自我檢測、EXTRA 特徵值
// （Arduino 會把同資料夾的 .ino 接在 fan_vest.ino 後面一起編譯，全域變數共用）

// ---------- 情境模式 ----------
struct ProfilePreset {
  float t0, t1, t2;
  int lowerBoost, maxPct;
  bool buzzer;
};
// 自訂（PROFILE_CUSTOM）不在表裡，保留使用者自己的設定
const ProfilePreset PRESETS[PROFILE_COUNT] = {
  {0, 0, 0, 0, 0, true},          // 自訂：不套用
  {25.0, 27.0, 33.0, 10, 100, true},  // 戶外工作：早點吹、早點全速
  {24.0, 26.0, 32.0, 20, 100, true},  // 運動：反應最快、下方加強多
  {27.0, 29.0, 36.0, 0, 40, false},   // 安靜：最高 40%、蜂鳴器關閉
  {27.0, 29.0, 37.0, 0, 60, true},    // 省電：最高 60%、門檻較高
};

void applyProfile(int p) {
  if (p < 0 || p >= PROFILE_COUNT) return;
  cfg.profile = p;
  if (p != PROFILE_CUSTOM) {
    const ProfilePreset& s = PRESETS[p];
    cfg.t0 = s.t0;
    cfg.t1 = s.t1;
    cfg.t2 = s.t2;
    cfg.lowerBoost = s.lowerBoost;
    cfg.maxPct = s.maxPct;
    cfg.buzzer = s.buzzer;
  }
  autoFanOn = false;
  Serial.printf("情境模式：%d\n", p);
}

// ---------- 喝水／休息提醒（累積熱暴露） ----------
const unsigned long COOL_RESET_MS = 5UL * 60000;  // 體感溫度低於門檻連續 5 分鐘，才重新計算連續高溫
const int REST_AFTER_MIN = 60;                     // 連續高溫超過 60 分鐘建議休息

unsigned long hotSeconds = 0;        // 連續高溫秒數
unsigned long totalHotSeconds = 0;   // 本次開機累積高溫秒數
unsigned long coolSinceMs = 0;
unsigned long nextHydrateAt = 0;     // 下一次提醒時的連續高溫秒數
bool restSuggested = false;
const uint16_t BEEP_HYDRATE[] = {80, 80, 80, 80, 300};

// 每秒呼叫一次
void updateHydration() {
  if (isnan(feelsC)) return;
  if (feelsC >= cfg.hydrateFeels) {
    coolSinceMs = 0;
    hotSeconds++;
    totalHotSeconds++;
    if (nextHydrateAt == 0) nextHydrateAt = cfg.hydrateMin * 60UL;
    if (hotSeconds >= nextHydrateAt) {
      hydrateDue = true;
      nextHydrateAt = hotSeconds + cfg.hydrateMin * 60UL;
      beep(BEEP_HYDRATE, 5);
    }
    if (!restSuggested && hotSeconds >= REST_AFTER_MIN * 60UL) {
      restSuggested = true;
      beep(BEEP_HEAT, 5);
    }
  } else {
    if (coolSinceMs == 0) coolSinceMs = millis();
    if (millis() - coolSinceMs >= COOL_RESET_MS) {  // 涼快一段時間了，重新計算
      hotSeconds = 0;
      nextHydrateAt = 0;
      restSuggested = false;
    }
  }
}

// 使用者按按鈕或在手機上操作，表示已看到提醒
void acknowledgeHydrate() { hydrateDue = false; }

// ---------- 偏好學習 ----------
// 自動模式下改成手動並維持 60 秒以上，代表使用者覺得自動風速不對。
// 把「想要的風速」換算成溫度偏移，慢慢累積到 learnShift（最多 ±3°C）。
const unsigned long LEARN_HOLD_MS = 60000;
const float LEARN_RATE = 0.2;      // 每個樣本只影響 20%，避免一次調太多
const float LEARN_LIMIT = 3.0;

bool learnPending = false;
unsigned long learnSinceMs = 0;
float learnTemp = NAN;

void noteManualChange() {
  if (!cfg.learn) return;
  learnPending = !autoMode && !isnan(controlTemp());
  learnSinceMs = millis();
  learnTemp = controlTemp();
}

void updateLearning() {
  if (!learnPending || autoMode) {
    learnPending = false;
    return;
  }
  if (millis() - learnSinceMs < LEARN_HOLD_MS) return;
  learnPending = false;

  // 使用者想要的平均風速 vs. 目前曲線在這個溫度給的風速
  int wanted = (manualUpper + manualLower) / 2;
  bool savedOn = autoFanOn;
  autoFanOn = true;  // 只是試算，不改變實際遲滯狀態
  int curve = autoPercent(learnTemp);
  autoFanOn = savedOn;
  if (wanted == 0) curve = max(curve, DUTY_MIN);  // 關掉代表覺得太涼，往後延
  float slope = (100.0 - DUTY_MIN) / (cfg.t2 - cfg.t1);  // 每度增加幾 %
  float sample = -(wanted - curve) / slope;               // 想要更強 -> 門檻往前（負值）
  sample = constrain(sample, -LEARN_LIMIT, LEARN_LIMIT);
  learnShift = constrain(learnShift + (sample - learnShift) * LEARN_RATE, -LEARN_LIMIT, LEARN_LIMIT);
  learnSamples = min(learnSamples + 1, 255);
  markDirty();
  Serial.printf("偏好學習：想要 %d%%、曲線 %d%%，偏移 %.2f°C（%d 筆）\n", wanted, curve, learnShift, learnSamples);
}

void loadLearning() {
  learnShift = prefs.getFloat("lshift", 0);
  learnSamples = prefs.getInt("lcount", 0);
}

void saveLearning() {
  prefs.putFloat("lshift", learnShift);
  prefs.putInt("lcount", learnSamples);
}

void resetLearning() {
  learnShift = 0;
  learnSamples = 0;
  markDirty();
}

// ---------- 開機自我檢測 ----------
// 依序讓上方、下方風扇各全速轉 1.5 秒，量後段 0.8 秒的平均電流，判斷哪一區風扇沒接好。
enum SelfTestStep { ST_IDLE, ST_UPPER, ST_LOWER };
SelfTestStep stStep = ST_IDLE;
unsigned long stStartMs = 0;
float stSum = 0;
int stCount = 0;
int stUpperMa = -1, stLowerMa = -1;  // -1 = 未測
bool stDone = false;

bool selfTestActive() { return stStep != ST_IDLE; }

void startSelfTest() {
  if (!inaFound) return;  // 沒有電流感測器就無法判斷
  stStep = ST_UPPER;
  stStartMs = millis();
  stSum = 0;
  stCount = 0;
  stDone = false;
  ledcWrite(PIN_FAN_UPPER, 255);
  ledcWrite(PIN_FAN_LOWER, 0);
}

void updateSelfTest() {
  if (stStep == ST_IDLE) return;
  static unsigned long lastStSample = 0;
  unsigned long t = millis() - stStartMs;
  // 前 0.7 秒等風扇轉穩，後 0.8 秒每 100ms 取樣（另外取樣，不和一秒平均混在一起）
  if (t >= 700 && t < 1500 && millis() - lastStSample >= 100) {
    lastStSample = millis();
    stSum += ina219.getCurrent_mA();
    stCount++;
  }
  if (t < 1500) return;
  int ma = stCount ? (int)(stSum / stCount) : 0;
  stSum = 0;
  stCount = 0;
  stStartMs = millis();
  if (stStep == ST_UPPER) {
    stUpperMa = ma;
    stStep = ST_LOWER;
    ledcWrite(PIN_FAN_UPPER, 0);
    ledcWrite(PIN_FAN_LOWER, 255);
  } else {
    stLowerMa = ma;
    stStep = ST_IDLE;
    stDone = true;
    outUpper = outLower = 0;  // 回到正常控制，從頭平滑加速
    Serial.printf("自我檢測：上方 %d mA、下方 %d mA\n", stUpperMa, stLowerMa);
  }
}

// ---------- EXTRA 特徵值 ----------
void publishExtra() {
  uint8_t f = 0;
  if (hydrateDue) f |= EXTRA_HYDRATE;
  if (restSuggested) f |= EXTRA_REST;
  if (selfTestActive()) f |= EXTRA_SELF_TEST;
  if (stDone) {
    f |= EXTRA_TESTED;
    if (stUpperMa >= FAN_MIN_MA) f |= EXTRA_UPPER_OK;
    if (stLowerMa >= FAN_MIN_MA) f |= EXTRA_LOWER_OK;
  }
  if (heatByStrain) f |= EXTRA_STRAIN;
  if (hrBoosting) f |= EXTRA_HR_BOOST;
  uint8_t b[19];
  b[0] = f;
  putInt16(b + 1, (int16_t)min(hotSeconds / 60, 65535UL));
  putInt16(b + 3, (int16_t)min(totalHotSeconds / 60, 65535UL));
  b[5] = cfg.profile;
  putInt16(b + 6, (int16_t)(stUpperMa < 0 ? 0xFFFF : stUpperMa));
  putInt16(b + 8, (int16_t)(stLowerMa < 0 ? 0xFFFF : stLowerMa));
  b[10] = FW_MAJOR;
  b[11] = FW_MINOR;
  putInt16(b + 12, tenths(learnShift));
  b[14] = learnSamples;
  b[15] = 0;
  b[16] = heartRateState();
  b[17] = hrBpm;
  b[18] = hrPeak;
  extraChar->setValue(b, sizeof(b));
  if (clientConnected) extraChar->notify();
}
