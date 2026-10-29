// 心率感測（MAX30102，I2C 位址 0x57，和 INA219 共用 GPIO21/22）與心率過高警報
// 需要的函式庫：SparkFun MAX3010x Pulse and Proximity Sensor Library
// 感測器要貼著皮膚（例如縫在領口內側貼脖子），動作太大時讀值會不穩，只當作參考與提醒

const uint32_t HR_CONTACT_IR = 50000;              // 紅外線反射低於此值 = 沒貼到皮膚
const int HR_SAMPLE_MS = 10;                       // 400Hz 取 4 次平均 = 每 10ms 一筆
const int HR_AVG_N = 4;                            // 取最近 4 次心跳平均
const unsigned long HR_STALE_MS = 4000;            // 超過 4 秒沒偵測到心跳就當作沒資料
const unsigned long HR_ALERT_HOLD_MS = 10000;      // 持續超過門檻 10 秒才警報，避免瞬間誤判
const unsigned long HR_BEEP_REPEAT_MS = 30000;     // 未靜音時每 30 秒再響一次
const uint16_t BEEP_HR[] = {60, 60, 60, 60, 60, 60, 60, 400};

int hrRates[HR_AVG_N], hrRateCount = 0, hrRateIdx = 0;
unsigned long hrSampleNo = 0, hrLastBeatNo = 0, hrLastBeatMs = 0, hrHighSince = 0, hrLastBeepMs = 0;

void setupHeartRate() {
  hrFound = pulse.begin(Wire, I2C_SPEED_STANDARD);
  if (!hrFound) {
    Serial.println("找不到 MAX30102，心率感測停用");
    return;
  }
  pulse.setup(0x1F, 4, 2, 400, 411, 4096);  // 亮度、4 次平均、紅光+紅外線、400Hz、脈寬、範圍
  pulse.setPulseAmplitudeRed(0x0A);         // 紅光只用來看有沒有貼到，調暗省電
}

void resetHeartRate() {
  hrBpm = 0;
  hrRateCount = hrRateIdx = 0;
  hrLastBeatNo = 0;
}

// 每次 loop() 都要呼叫：感測器內部只暫存幾筆資料，太久沒讀會漏掉
void updateHeartRate() {
  if (!hrFound) return;
  pulse.check();
  while (pulse.available()) {
    uint32_t ir = pulse.getFIFOIR();
    pulse.nextSample();
    hrSampleNo++;
    bool contact = ir >= HR_CONTACT_IR;
    if (contact != hrContact) {
      hrContact = contact;
      resetHeartRate();
    }
    if (!contact || !checkForBeat(ir)) continue;
    // 用樣本數算時間，比 millis() 準（資料是一批一批讀出來的）
    unsigned long gapMs = (hrSampleNo - hrLastBeatNo) * HR_SAMPLE_MS;
    bool first = hrLastBeatNo == 0;
    hrLastBeatNo = hrSampleNo;
    if (first) continue;
    int bpm = 60000 / gapMs;
    if (bpm < 35 || bpm > 220) continue;  // 雜訊
    hrLastBeatMs = millis();
    hrRates[hrRateIdx] = bpm;
    hrRateIdx = (hrRateIdx + 1) % HR_AVG_N;
    if (hrRateCount < HR_AVG_N) hrRateCount++;
    if (hrRateCount == HR_AVG_N) {
      int sum = 0;
      for (int i = 0; i < HR_AVG_N; i++) sum += hrRates[i];
      hrBpm = sum / HR_AVG_N;
      hrPeak = max(hrPeak, hrBpm);
    }
  }
  if (hrBpm && millis() - hrLastBeatMs > HR_STALE_MS) resetHeartRate();
}

// 每秒呼叫一次：心率持續高於門檻就響蜂鳴器。這是安全警報，蜂鳴器設定關閉時也會響
void updateHeartRateAlert() {
  bool high = hrBpm >= cfg.hrHigh;
  if (high) {
    if (hrHighSince == 0) hrHighSince = millis();
  } else {
    hrHighSince = 0;
  }
  bool was = hrAlert;
  if (!hrAlert && high && millis() - hrHighSince >= HR_ALERT_HOLD_MS) hrAlert = true;
  if (hrAlert && (hrBpm == 0 || hrBpm < cfg.hrHigh - 10)) hrAlert = false;  // 降下來 10 下才解除
  if (!hrAlert) hrMuted = false;
  if (hrAlert && !hrMuted && (!was || millis() - hrLastBeepMs >= HR_BEEP_REPEAT_MS)) {
    hrLastBeepMs = millis();
    alarmBeep(BEEP_HR, 8);
    Serial.printf("心率過高：%d bpm\n", hrBpm);
  }
}

// EXTRA 第 16 byte：0 = 沒有感測器、1 = 沒貼到皮膚、2 = 量測中、3 = 有讀值
uint8_t heartRateState() {
  if (!hrFound) return 0;
  if (!hrContact) return 1;
  return hrBpm ? 3 : 2;
}
