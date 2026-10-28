// 藍牙連線、示範模式與操作事件。畫面繪製在 ui.js。
(() => {
  const { ui, state, FLAG, render, buildCurve, pushHistory, fillSettingsForm, sliderFill } = window.FV;
  const { t } = window.I18N;
  const UUID = n => `7a1e000${n}-5c2b-4f0a-9d3e-6b8f2a4c9e10`;
  const SERVICE = UUID(1), STATUS = UUID(2), CONTROL = UUID(3), CONFIG = UUID(4), SETTINGS = UUID(5);
  const INVALID = -32768;
  const demo = new URLSearchParams(location.search).has('demo');

  let device = null, controlChar = null, settingsChar = null, userDisconnect = false;

  // ---------- 資料解析（格式見韌體開頭註解） ----------
  const t10 = v => (v === INVALID ? null : v / 10);

  function parseStatus(dv) {
    if (dv.byteLength < 20) return;  // 舊版韌體，請重新燒錄
    const wasHeat = state.flags & FLAG.HEAT;
    state.temp = t10(dv.getInt16(0, true));
    const hum = dv.getUint8(2);
    state.hum = hum === 255 ? null : hum;
    state.feels = t10(dv.getInt16(3, true));
    state.upper = dv.getUint8(5);
    state.lower = dv.getUint8(6);
    state.auto = dv.getUint8(7) === 1;
    if (!state.dragging) {
      state.manualUpper = dv.getUint8(8);
      state.manualLower = dv.getUint8(9);
    }
    state.mv = dv.getUint16(10, true);
    state.ma = dv.getInt16(12, true);
    const batt = dv.getUint8(14);
    state.batt = batt === 255 ? null : batt;
    state.flags = dv.getUint8(15);
    state.wh = dv.getUint16(16, true) / 100;
    state.uptime = dv.getUint16(18, true);
    onStatusUpdated(wasHeat);
  }

  function parseConfig(dv) {
    state.cfg = {
      dmin: dv.getUint8(0), fail: dv.getUint8(1), ocMa: dv.getUint16(2, true),
      emptyMv: dv.getUint16(4, true), fullMv: dv.getUint16(6, true), lowCap: dv.getUint8(8),
    };
  }

  function parseSettings(dv) {
    state.set = {
      t0: dv.getInt16(0, true) / 10, t1: dv.getInt16(2, true) / 10, t2: dv.getInt16(4, true) / 10,
      boost: dv.getUint8(6), heat: dv.getInt16(7, true) / 10, buzzer: dv.getUint8(9) === 1, useFeels: dv.getUint8(10) === 1,
    };
    buildCurve();
    fillSettingsForm();
  }

  function onStatusUpdated(wasHeat) {
    // 中暑警示剛出現時讓手機震動（代替震動馬達，需要網頁在前景）
    if ((state.flags & FLAG.HEAT) && !wasHeat && navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    pushHistory();
    render();
  }

  // ---------- 藍牙 ----------
  async function openGatt() {
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(SERVICE);
    const [statusChar, ctrl, cfgChar, setChar] = await Promise.all(
      [STATUS, CONTROL, CONFIG, SETTINGS].map(u => svc.getCharacteristic(u)));
    controlChar = ctrl;
    settingsChar = setChar;
    parseConfig(await cfgChar.readValue());  // 第一次讀取時手機會跳出配對碼輸入
    parseSettings(await setChar.readValue());
    statusChar.addEventListener('characteristicvaluechanged', e => parseStatus(e.target.value));
    await statusChar.startNotifications();
    parseStatus(await statusChar.readValue());
    setLink('connected');
  }

  async function connect() {
    showError('');
    if (demo) return startDemo();
    try {
      setLink('connecting');
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
      device.addEventListener('gattserverdisconnected', onDisconnected);
      userDisconnect = false;
      await openGatt();
    } catch (err) {
      setLink('idle');
      if (err.name === 'NotFoundError') return;  // 使用者取消選擇
      const pairing = /auth|encrypt|insufficient|security/i.test(err.message);
      showError(pairing
        ? t('errPairing')
        : t('errConnect', { msg: err.message }));
    }
  }

  async function onDisconnected() {
    controlChar = settingsChar = null;
    if (userDisconnect) { setLink('idle'); return; }
    setLink('lost');
    for (const wait of [500, 1500, 3000]) {
      await new Promise(r => setTimeout(r, wait));
      try { await openGatt(); return; } catch (_) { /* 再試一次 */ }
    }
    setLink('idle');
    showError(t('errLost'));
  }

  function disconnect() {
    userDisconnect = true;
    if (demo) { stopDemo(); setLink('idle'); return; }
    if (device && device.gatt.connected) device.gatt.disconnect();
    else setLink('idle');
  }

  async function write(char, bytes, what) {
    if (demo) return true;
    if (!char) return false;
    try { await char.writeValueWithResponse(bytes); return true; }
    catch (err) { ui.foot.textContent = t('errWrite', { what: t(what), msg: err.message }); return false; }
  }

  function sendControl() {
    if (demo) demoApply();
    return write(controlChar, new Uint8Array([state.auto ? 1 : 0, state.manualUpper, state.manualLower]), 'whatCommand');
  }

  // ---------- 螢幕保持亮著（避免手機休眠時藍牙斷線） ----------
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
      }
    } catch (_) { /* 省電模式下可能被系統拒絕，不影響其他功能 */ }
  }
  document.addEventListener('visibilitychange', () => keepAwake(state.link === 'connected'));

  function setLink(s) {
    state.link = s;
    if (s !== 'connected') state.dragging = false;
    keepAwake(s === 'connected');
    ui.saveBtn.disabled = s !== 'connected';
    render();
  }
  function showError(msg) {
    ui.connectError.hidden = !msg;
    ui.connectErrorText.textContent = msg || '';
  }

  // ---------- 設定表單 ----------
  async function saveSettings(e) {
    e.preventDefault();
    const n = el => parseFloat(el.value);
    const s = { t0: n(ui.setT0), t1: n(ui.setT1), t2: n(ui.setT2), heat: n(ui.setHeat),
      boost: Number(ui.setBoost.value), buzzer: ui.setBuzzer.checked, useFeels: ui.setFeels.checked };
    let err = '';
    if ([s.t0, s.t1, s.t2, s.heat].some(Number.isNaN)) err = t('errNumber');
    else if (!(s.t0 < s.t1 && s.t1 < s.t2)) err = t('errOrder');
    else if (s.t0 < 15 || s.t2 > 45) err = t('errRange');
    else if (s.t1 - s.t0 < 1) err = t('errGap');
    else if (s.heat < 30 || s.heat > 55) err = t('errHeat');
    ui.settingsError.hidden = !err;
    ui.settingsErrorText.textContent = err;
    if (err) return;

    const b = new DataView(new ArrayBuffer(11));
    b.setInt16(0, Math.round(s.t0 * 10), true);
    b.setInt16(2, Math.round(s.t1 * 10), true);
    b.setInt16(4, Math.round(s.t2 * 10), true);
    b.setUint8(6, s.boost);
    b.setInt16(7, Math.round(s.heat * 10), true);
    b.setUint8(9, s.buzzer ? 1 : 0);
    b.setUint8(10, s.useFeels ? 1 : 0);
    ui.saveBtn.disabled = true;
    const ok = await write(settingsChar, b.buffer, 'whatSettings');
    if (ok && !demo) parseSettings(await settingsChar.readValue());  // 讀回背心實際採用的設定
    if (ok && demo) { state.set = s; buildCurve(); }
    ui.saveBtn.disabled = state.link !== 'connected';
    ui.settingsNote.textContent = t(ok ? 'settingsSaved' : 'settingsFailed');
    render();
  }

  // ---------- 示範模式（網址加上 ?demo，不需要硬體） ----------
  let demoTimer = null, demoClock = 0, demoFanOn = false;

  // 熱指數（與韌體 DHT 函式庫相同的 NOAA 公式）
  function heatIndex(tC, h) {
    const T = tC * 9 / 5 + 32;
    let hi = 0.5 * (T + 61 + (T - 68) * 1.2 + h * 0.094);
    if (hi > 79) {
      hi = -42.379 + 2.04901523 * T + 10.14333127 * h - 0.22475541 * T * h - 0.00683783 * T * T
        - 0.05481717 * h * h + 0.00122874 * T * T * h + 0.00085282 * T * h * h - 0.00000199 * T * T * h * h;
      if (h < 13 && T >= 80 && T <= 112) hi -= ((13 - h) * 0.25) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
      else if (h > 85 && T >= 80 && T <= 87) hi += ((h - 85) * 0.1) * ((87 - T) * 0.2);
    }
    return (hi - 32) * 5 / 9;
  }

  function demoApply() {
    const { t0, t1, t2, boost, heat, useFeels } = state.set, { dmin, lowCap } = state.cfg;
    const t = useFeels ? state.feels : state.temp;
    if (!demoFanOn && t >= t1) demoFanOn = true;
    if (demoFanOn && t < t0) demoFanOn = false;
    const auto = !demoFanOn ? 0 : t >= t2 ? 100 : Math.max(dmin, Math.round(dmin + (t - t1) / (t2 - t1) * (100 - dmin)));
    const low = state.batt < 20;
    const lim = p => { p = low ? Math.min(p, lowCap) : p; return p > 0 && p < dmin ? dmin : p; };
    state.upper = lim(state.auto ? auto : state.manualUpper);
    state.lower = lim(state.auto ? (auto ? Math.min(100, auto + boost) : 0) : state.manualLower);
    state.ma = 3 + (state.upper + state.lower) * 8 + (Math.random() - .5) * 30;
    state.mv = 10200 + state.batt / 100 * 2400 - state.ma * .3;
    let f = 0;
    if (state.feels >= heat) f |= FLAG.HEAT;
    if (low) f |= FLAG.LOW_BATT;
    const wasHeat = state.flags & FLAG.HEAT;
    if ((f & FLAG.HEAT) && (state.flags & FLAG.MUTED)) f |= FLAG.MUTED;
    state.flags = f;
    onStatusUpdated(wasHeat);
  }

  function startDemo() {
    buildCurve();
    fillSettingsForm();
    state.batt = 86; state.wh = 0; state.uptime = 0;
    state.temp = 31; state.hum = 60; state.feels = heatIndex(31, 60);
    setLink('connected');
    demoApply();
    demoTimer = setInterval(() => {
      demoClock += 1;
      state.temp = 31 + 4.5 * Math.sin(demoClock / 25) + (Math.random() - .5) * .4;
      state.hum = Math.round(62 + 10 * Math.sin(demoClock / 40));
      state.feels = heatIndex(state.temp, state.hum);
      state.batt = Math.max(0, 86 - Math.floor(demoClock / 8));
      state.wh += (state.mv / 1000) * (state.ma / 1000) / 3600 * 60;  // 示範用：時間加速 60 倍
      state.uptime = demoClock;
      demoApply();
    }, 1000);
    ui.foot.textContent = t('demoFoot');
  }
  function stopDemo() { clearInterval(demoTimer); ui.foot.textContent = ''; }

  // ---------- 事件 ----------
  ui.connectBtn.addEventListener('click', connect);
  ui.disconnectBtn.addEventListener('click', disconnect);
  ui.modeAuto.addEventListener('click', () => { state.auto = true; render(); sendControl(); });
  ui.modeManual.addEventListener('click', () => { state.auto = false; render(); sendControl(); });
  ui.muteBtn.addEventListener('click', () => {
    state.flags |= FLAG.MUTED;  // 送出任何控制指令，韌體都會把目前的警示視為已確認
    render();
    sendControl();
  });

  let sendTimer = null;
  for (const [slider, out, key] of [[ui.sliderUpper, ui.outUpper, 'manualUpper'], [ui.sliderLower, ui.outLower, 'manualLower']]) {
    slider.addEventListener('pointerdown', () => { state.dragging = true; });
    slider.addEventListener('input', () => {
      state[key] = Number(slider.value);
      out.textContent = slider.value + '%';
      sliderFill(slider);
      clearTimeout(sendTimer);
      sendTimer = setTimeout(sendControl, 120);  // 拖曳時節流，避免塞爆藍牙
    });
    slider.addEventListener('change', () => {
      state.dragging = false;
      clearTimeout(sendTimer);
      sendControl();
      render();
    });
  }
  ui.setBoost.addEventListener('input', () => { ui.outBoost.textContent = ui.setBoost.value + '%'; sliderFill(ui.setBoost); });
  ui.settingsForm.addEventListener('submit', saveSettings);

  if (!demo && !navigator.bluetooth) {
    ui.unsupported.hidden = false;
    ui.connectBtn.disabled = true;
    ui.connectText.hidden = true;
  }
  // 語言：套用靜態文字，示範模式改用示範說明，切換語言時重畫
  const applyLang = () => {
    window.I18N.applyStatic();
    if (demo) ui.connectText.textContent = t('connectTextDemo');
    if (demo && state.link === 'connected') ui.foot.textContent = t('demoFoot');
    buildCurve();
    render();
  };
  ui.connectText.dataset.i18n = 'connectText';
  ui.langBtn.addEventListener('click', () => window.I18N.setLang(window.I18N.lang === 'zh' ? 'en' : 'zh'));
  window.I18N.onChange(applyLang);
  applyLang();

  buildCurve();
  fillSettingsForm();
  render();
  if (demo) ui.connectBtn.disabled = false;
  setInterval(() => { if (state.link === 'connected') render(); }, 5000);  // 讓歷史圖的時間軸持續往前

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
