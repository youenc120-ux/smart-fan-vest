// 介面翻譯：繁體中文／English。靜態文字用 data-i18n，動態文字用 I18N.t('key', {變數})。
window.I18N = (() => {
  const STR = {
    zh: {
      title: '風扇背心控制',
      brand: '風扇背心',
      langBtn: 'EN',
      langLabel: 'Switch to English',
      connectTitle: '連線到背心',
      connectText: '打開背心電源與手機藍牙，再點下面的按鈕，從清單選擇「FanVest」。第一次連線時手機會要求輸入配對碼（預設 123456）。',
      connectTextDemo: '示範模式：點下面的按鈕，用模擬資料預覽介面。',
      unsupported: '這個瀏覽器不支援藍牙網頁連線。Android 請用 Chrome 開啟本頁；iPhone 請改用 Bluefy 瀏覽器。',
      connectBtn: '連線裝置',
      linkIdle: '未連線', linkConnecting: '連線中…', linkConnected: '已連線', linkLost: '重新連線中…',
      readings: '即時讀數',
      insideTemp: '背心內溫度',
      upperShort: '上', lowerShort: '下',
      humidity: '濕度', feelsLike: '體感溫度', basisFeels: '體感溫度', basisTemp: '溫度', axisFeels: '體感溫度', axisTemp: '溫度',
      levelCool: '涼爽', levelWarm: '溫暖', levelHot: '炎熱', levelPeak: '高溫・全速散熱',
      sensorError: '溫濕度感測器沒有回應，風扇暫以 {fail}% 安全轉速運轉。請檢查 DHT 接線。',
      hintIdle: '連線後會顯示即時溫度與風速。',
      hintAuto: '自動模式：{basis} {t1}°C 以上開始送風，{t2}°C 全速。',
      hintManual: '手動模式：風速由滑桿決定，不受溫度影響。',
      heatTitle: '中暑風險：體感溫度 {feels}°C',
      heatText: '請盡快到陰涼處休息、補充水分；若頭暈、噁心或停止流汗，請立即求助。',
      mute: '我知道了',
      controlTitle: '控制模式',
      modeAuto: '自動', modeManual: '手動',
      upperSpeed: '上方風速', lowerSpeed: '下方風速',
      sliderIdle: '連線後可以使用。',
      sliderAuto: '自動模式時，下方比上方多吹 {boost}%，可在「設定」調整。',
      sliderManual: '低於 {dmin}% 時風扇可能轉不動，會自動提高到 {dmin}%；拉到 0 為停止。',
      powerTitle: '電源',
      battery: '電池（估算）',
      current: '電流', voltage: '電壓', power: '功率',
      usage: '本次開機 {time}，耗電 {wh} Wh',
      hours: '{h} 小時 ', minutes: '{m} 分鐘',
      powerMissing: '沒有偵測到電流感測器（INA219），其他功能照常運作。',
      overcurrent: '電流超過 {amps}A，已自動停止風扇保護電路。請檢查風扇與接線，排除後切換一次模式、調整風速，或長按背心上的按鈕即可恢復。',
      fanLow: '風扇在轉但電流只有 {ma} mA，可能有風扇沒接好或斷線。',
      lowBatt: '電量偏低，已限制最高風速為 {cap}% 以延長使用時間，請盡快充電。',
      historyTitle: '最近 10 分鐘',
      historyChart: '最近 10 分鐘溫度與風速',
      legendTemp: '溫度', legendFeels: '體感', legendFan: '風速（右軸）',
      historyNote: '連線後開始記錄，網頁關閉後會清除。',
      minAgo: '-{m} 分', now: '現在',
      curveTitle: '溫度與風速曲線',
      curveChart: '溫度對應風速曲線',
      curveAuto: '橫軸是{basis}，圓點是上方目前的位置；下方會再加強 {boost}%。藍色區是遲滯區：風扇轉動後要降到 {t0}°C 以下才停。',
      curveManual: '手動模式中，虛線是你設定的上方風速；曲線僅供參考。',
      settingsTitle: '設定',
      settingsSub: '溫度門檻、警示、蜂鳴器',
      setT1: '啟動溫度', setT0: '停止溫度', setT2: '全速溫度', setHeat: '中暑警示（體感）',
      setBoost: '自動模式下方加強',
      setFeels: '依體感溫度控制（考慮濕度，悶熱時吹更強）',
      setBuzzer: '蜂鳴器提醒',
      save: '儲存到背心',
      settingsNote: '設定會存在背心裡，重新開機也不會消失。',
      settingsSaved: '已儲存到背心，重新開機也不會消失。',
      settingsFailed: '儲存失敗，請再試一次。',
      errNumber: '每個溫度欄位都要填數字。',
      errOrder: '溫度要符合：停止溫度 < 啟動溫度 < 全速溫度。',
      errRange: '溫度範圍要在 15–45°C 之間。',
      errGap: '停止溫度至少要比啟動溫度低 1°C（DHT11 建議 2°C），風扇才不會忽開忽關。',
      errHeat: '中暑警示要在 30–55°C 之間。',
      disconnect: '中斷連線',
      errPairing: '配對失敗，請確認配對碼是否正確（預設 123456）。若之前配對過舊版韌體，請到手機藍牙設定把「FanVest」取消配對後再試。',
      errConnect: '連不上背心（{msg}）。請確認背心電源已開啟、距離在幾公尺內，再試一次。',
      errLost: '和背心的連線中斷了。請確認背心電源與距離，再點「連線裝置」。',
      errWrite: '{what}沒有送出（{msg}），請再試一次。',
      whatCommand: '指令', whatSettings: '設定',
      demoFoot: '示範模式：資料為模擬，時間加速播放。',
    },
    en: {
      title: 'Fan Vest Control',
      brand: 'Fan Vest',
      langBtn: '中',
      langLabel: '切換為中文',
      connectTitle: 'Connect to your vest',
      connectText: 'Turn on the vest and your phone\'s Bluetooth, then tap the button below and choose "FanVest". The first time, your phone will ask for the pairing code (default 123456).',
      connectTextDemo: 'Demo mode: tap the button below to preview the interface with simulated data.',
      unsupported: 'This browser can\'t use Bluetooth from a web page. On Android, open this page in Chrome; on iPhone, use the Bluefy browser.',
      connectBtn: 'Connect',
      linkIdle: 'Not connected', linkConnecting: 'Connecting…', linkConnected: 'Connected', linkLost: 'Reconnecting…',
      readings: 'Live readings',
      insideTemp: 'Inside the vest',
      upperShort: 'Up', lowerShort: 'Low',
      humidity: 'Humidity', feelsLike: 'Feels like', basisFeels: 'a feels-like temperature of', basisTemp: 'a temperature of', axisFeels: 'feels-like temperature', axisTemp: 'temperature',
      levelCool: 'Cool', levelWarm: 'Warm', levelHot: 'Hot', levelPeak: 'Very hot · full cooling',
      sensorError: 'The temperature/humidity sensor isn\'t responding, so the fans are running at a safe {fail}%. Check the DHT wiring.',
      hintIdle: 'Temperature and fan speed appear once connected.',
      hintAuto: 'Auto: fans start at {basis} {t1}°C and reach full speed at {t2}°C.',
      hintManual: 'Manual: the sliders set the fan speed; temperature is ignored.',
      heatTitle: 'Heat illness risk: feels like {feels}°C',
      heatText: 'Rest in the shade and drink water now. If you feel dizzy or sick, or stop sweating, get help right away.',
      mute: 'Got it',
      controlTitle: 'Mode',
      modeAuto: 'Auto', modeManual: 'Manual',
      upperSpeed: 'Upper fans', lowerSpeed: 'Lower fans',
      sliderIdle: 'Available once connected.',
      sliderAuto: 'In auto mode the lower fans run {boost}% faster than the upper ones. Change this in Settings.',
      sliderManual: 'Below {dmin}% the fans may not spin, so they\'re raised to {dmin}%. Slide to 0 to stop.',
      powerTitle: 'Power',
      battery: 'Battery (estimate)',
      current: 'Current', voltage: 'Voltage', power: 'Power',
      usage: 'On for {time}, used {wh} Wh',
      hours: '{h} h ', minutes: '{m} min',
      powerMissing: 'No current sensor (INA219) found. Everything else still works.',
      overcurrent: 'Current went above {amps} A, so the fans were stopped to protect the circuit. Check the fans and wiring, then switch modes, move a slider, or hold the button on the vest to resume.',
      fanLow: 'The fans should be running but draw only {ma} mA. A fan may be unplugged or disconnected.',
      lowBatt: 'Battery is low, so top fan speed is limited to {cap}% to make it last. Charge it soon.',
      historyTitle: 'Last 10 minutes',
      historyChart: 'Temperature and fan speed over the last 10 minutes',
      legendTemp: 'Temp', legendFeels: 'Feels like', legendFan: 'Fan speed (right axis)',
      historyNote: 'Recording starts when you connect and is cleared when you close the page.',
      minAgo: '-{m} min', now: 'now',
      curveTitle: 'Temperature vs. fan speed',
      curveChart: 'Fan speed for each temperature',
      curveAuto: 'The x-axis is {basisName}; the dot shows the upper fans now, and the lower fans add {boost}%. In the blue band the fans keep running until it drops below {t0}°C.',
      curveManual: 'In manual mode the dashed line is your upper fan speed; the curve is for reference only.',
      settingsTitle: 'Settings',
      settingsSub: 'Temperature thresholds, alert, buzzer',
      setT1: 'Start at', setT0: 'Stop below', setT2: 'Full speed at', setHeat: 'Heat alert (feels like)',
      setBoost: 'Lower fan boost (auto)',
      setFeels: 'Use feels-like temperature (blows harder when it\'s humid)',
      setBuzzer: 'Buzzer alerts',
      save: 'Save to vest',
      settingsNote: 'Settings are stored on the vest and survive a restart.',
      settingsSaved: 'Saved to the vest. It will keep these after a restart.',
      settingsFailed: 'Couldn\'t save. Try again.',
      errNumber: 'Enter a number in every temperature field.',
      errOrder: 'Temperatures must go: stop below < start at < full speed at.',
      errRange: 'Temperatures must be between 15 and 45°C.',
      errGap: '"Stop below" must be at least 1°C under "Start at" (2°C recommended for DHT11) so the fans don\'t flicker on and off.',
      errHeat: 'The heat alert must be between 30 and 55°C.',
      disconnect: 'Disconnect',
      errPairing: 'Pairing failed. Check the pairing code (default 123456). If this phone was paired with older firmware, remove "FanVest" in your phone\'s Bluetooth settings and try again.',
      errConnect: 'Couldn\'t connect to the vest ({msg}). Make sure it\'s on and within a few meters, then try again.',
      errLost: 'Lost the connection to the vest. Check that it\'s on and nearby, then tap Connect.',
      errWrite: 'The {what} wasn\'t sent ({msg}). Try again.',
      whatCommand: 'command', whatSettings: 'settings',
      demoFoot: 'Demo mode: simulated data, time sped up.',
    },
  };

  const KEY = 'fv-lang';
  let lang = 'zh';
  try { lang = localStorage.getItem(KEY) || ''; } catch (_) { /* 無痕模式可能無法存取 */ }
  if (!STR[lang]) lang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';

  const listeners = [];

  function t(key, vars = {}) {
    const s = STR[lang][key] ?? STR.zh[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  }

  // 套用到有 data-i18n（文字）與 data-i18n-aria（aria-label）的元素
  function applyStatic() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.title = t('title');
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
  }

  function setLang(next) {
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (_) { /* 只影響記住語言 */ }
    applyStatic();
    listeners.forEach(fn => fn(lang));
  }

  return { t, applyStatic, setLang, onChange: fn => listeners.push(fn), get lang() { return lang; } };
})();
