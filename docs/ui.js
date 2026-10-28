// 畫面：狀態、儀表、電源、圖表的繪製。藍牙與事件在 app.js。
window.FV = (() => {
  const $ = id => document.getElementById(id);
  const t = (key, vars) => window.I18N.t(key, vars);
  const ids = ['langBtn', 'link', 'linkText', 'connectPanel', 'connectText', 'connectBtn', 'connectBtnText', 'unsupported',
    'connectError', 'connectErrorText', 'heatAlert', 'heatAlertTitle', 'heatAlertText', 'muteBtn', 'arc', 'temp',
    'level', 'pctUpper', 'pctLower', 'fanIcon', 'hum', 'feels', 'sensorError', 'sensorErrorText', 'hint',
    'modeAuto', 'modeManual', 'sliderUpper', 'sliderLower', 'outUpper', 'outLower', 'sliderNote',
    'battPct', 'battFill', 'amps', 'volts', 'watts', 'usage', 'powerGrid', 'powerNote', 'overcurrent',
    'overcurrentText', 'fanLow', 'fanLowText', 'lowBatt', 'lowBattText', 'historyChart', 'historyNote',
    'chart', 'curveSub', 'settingsForm', 'setT0', 'setT1', 'setT2', 'setHeat', 'setBoost', 'outBoost',
    'setFeels', 'setBuzzer', 'saveBtn', 'settingsError', 'settingsErrorText', 'settingsNote',
    'disconnectBtn', 'foot'];
  const ui = Object.fromEntries(ids.map(id => [id, $(id)]));

  // 與韌體 FLAG_* 相同
  const FLAG = { POWER_MISSING: 0x01, OVERCURRENT: 0x02, FAN_LOW: 0x04, HEAT: 0x08, LOW_BATT: 0x10, MUTED: 0x20 };

  const state = {
    link: 'idle',  // idle | connecting | connected | lost
    temp: null, hum: null, feels: null,
    upper: null, lower: null, auto: true, manualUpper: 50, manualLower: 50,
    mv: null, ma: null, batt: null, flags: FLAG.POWER_MISSING, wh: 0, uptime: 0,
    cfg: { dmin: 30, fail: 70, ocMa: 3000, emptyMv: 10200, fullMv: 12600, lowCap: 70 },
    set: { t0: 26, t1: 28, t2: 35, boost: 10, heat: 40, buzzer: true, useFeels: true },
    dragging: false,
    history: [],  // { t, temp, feels, pct }
  };

  const live = () => state.link === 'connected';
  const ctrlTemp = () => (state.set.useFeels && state.feels !== null ? state.feels : state.temp);
  const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);

  // 溫度分級：顏色＋文字，不只靠顏色辨識
  function level(temp) {
    const { t1, t2 } = state.set;
    if (temp === null) return { color: 'var(--idle)', text: '' };
    if (temp < t1) return { color: 'var(--cool)', text: t('levelCool') };
    if (temp < (t1 + t2) / 2) return { color: 'var(--warm)', text: t('levelWarm') };
    if (temp < t2) return { color: 'var(--hot)', text: t('levelHot') };
    return { color: 'var(--peak)', text: t('levelPeak') };
  }
  const basisText = () => t(state.set.useFeels ? 'basisFeels' : 'basisTemp');

  // ---------- SVG 小工具 ----------
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // ---------- 溫度－風速曲線 ----------
  const C = { x0: 34, x1: 326, y0: 160, y1: 14, tmin: 20, tmax: 45 };
  const sx = t => C.x0 + (Math.min(Math.max(t, C.tmin), C.tmax) - C.tmin) / (C.tmax - C.tmin) * (C.x1 - C.x0);
  const sy = p => C.y0 - p / 100 * (C.y0 - C.y1);
  let curve = null;

  function buildCurve() {
    const svg = ui.chart, { t0, t1, t2 } = state.set, { dmin } = state.cfg;
    svg.textContent = '';
    el('rect', { class: 'band', x: sx(t0), y: C.y1, width: sx(t1) - sx(t0), height: C.y0 - C.y1 }, svg);
    for (const p of [0, 50, 100]) {
      el('line', { class: 'axis', x1: C.x0, x2: C.x1, y1: sy(p), y2: sy(p) }, svg);
      el('text', { class: 'tick', x: C.x0 - 6, y: sy(p) + 4, 'text-anchor': 'end' }, svg).textContent = p + '%';
    }
    for (const deg of [20, 25, 30, 35, 40, 45]) {
      el('text', { class: 'tick', x: sx(deg), y: C.y0 + 18, 'text-anchor': 'middle' }, svg).textContent = deg + '°';
    }
    const path = el('path', { class: 'path', d: `M${sx(C.tmin)} ${sy(0)} H${sx(t1)} V${sy(dmin)} L${sx(t2)} ${sy(100)} H${sx(C.tmax)}` }, svg);
    const manualLine = el('line', { class: 'manual-line', x1: C.x0, x2: C.x1, y1: sy(50), y2: sy(50), opacity: 0 }, svg);
    const marker = el('g', { class: 'marker', opacity: 0 }, svg);
    const guide = el('line', { class: 'marker-guide', x1: 0, x2: 0, y1: 0, y2: 0 }, marker);
    el('circle', { class: 'ring', r: 13 }, marker);
    el('circle', { class: 'core', r: 6.5 }, marker);
    curve = { path, manualLine, marker, guide };
  }

  function drawCurve() {
    const { path, manualLine, marker, guide } = curve, on = live(), temp = ctrlTemp();
    path.classList.toggle('dim', on && !state.auto);
    manualLine.setAttribute('opacity', on && !state.auto ? 1 : 0);
    manualLine.setAttribute('y1', sy(state.manualUpper));
    manualLine.setAttribute('y2', sy(state.manualUpper));
    if (on && temp !== null && state.upper !== null) {
      const x = sx(temp), y = sy(state.upper);
      marker.setAttribute('opacity', 1);
      marker.style.transform = `translate(${x}px, ${y}px)`;
      guide.setAttribute('y2', C.y0 - y);
    } else {
      marker.setAttribute('opacity', 0);
    }
    ui.curveSub.textContent = state.auto || !on
      ? t('curveAuto', { basis: basisText(), basisName: t(state.set.useFeels ? 'axisFeels' : 'axisTemp'), boost: state.set.boost, t0: state.set.t0 })
      : t('curveManual');
  }

  // ---------- 最近 10 分鐘 ----------
  const H = { x0: 30, x1: 312, y0: 140, y1: 10, span: 600000 };
  function pushHistory() {
    const now = Date.now(), h = state.history;
    if (h.length && now - h[h.length - 1].t < 900) return;
    h.push({ t: now, temp: state.temp, feels: state.feels, pct: Math.max(state.upper || 0, state.lower || 0) });
    while (h.length && now - h[0].t > H.span) h.shift();
  }

  function drawHistory() {
    const svg = ui.historyChart, h = state.history, now = Date.now();
    svg.textContent = '';
    const vals = h.flatMap(p => [p.temp, p.feels]).filter(v => v !== null);
    const lo = Math.floor((vals.length ? Math.min(...vals) : 24) - 1), hi = Math.ceil((vals.length ? Math.max(...vals) : 36) + 1);
    const tx = time => H.x0 + (1 - (now - time) / H.span) * (H.x1 - H.x0);
    const ty = v => H.y0 - (v - lo) / (hi - lo) * (H.y0 - H.y1);
    const py = p => H.y0 - p / 100 * (H.y0 - H.y1);
    for (const v of [lo, (lo + hi) / 2, hi]) {
      el('line', { class: 'axis', x1: H.x0, x2: H.x1, y1: ty(v), y2: ty(v) }, svg);
      el('text', { class: 'tick', x: H.x0 - 6, y: ty(v) + 4, 'text-anchor': 'end' }, svg).textContent = Math.round(v) + '°';
    }
    for (const p of [0, 100]) el('text', { class: 'tick', x: H.x1 + 6, y: py(p) + 4 }, svg).textContent = p + '%';
    for (const m of [10, 5, 0]) {
      el('text', { class: 'tick', x: tx(now - m * 60000), y: H.y0 + 18, 'text-anchor': 'middle' }, svg).textContent = m ? t('minAgo', { m }) : t('now');
    }
    if (state.set.heat > lo && state.set.heat < hi) {
      el('line', { class: 'h-alert', x1: H.x0, x2: H.x1, y1: ty(state.set.heat), y2: ty(state.set.heat) }, svg);
    }
    if (h.length < 2) return;
    const fan = h.map(p => `${tx(p.t)},${py(p.pct)}`);
    el('polygon', { class: 'h-fan', points: `${tx(h[0].t)},${H.y0} ${fan.join(' ')} ${tx(h[h.length - 1].t)},${H.y0}` }, svg);
    const line = key => h.filter(p => p[key] !== null).map(p => `${tx(p.t)},${ty(p[key])}`).join(' ');
    el('polyline', { class: 'h-feels', points: line('feels') }, svg);
    el('polyline', { class: 'h-temp', points: line('temp') }, svg);
  }

  // ---------- 主畫面 ----------
  const LINK_KEY = { idle: 'linkIdle', connecting: 'linkConnecting', connected: 'linkConnected', lost: 'linkLost' };
  const sliderFill = s => s.style.setProperty('--fill', (s.value / s.max * 100) + '%');

  function render() {
    const on = live(), s = state, f = s.flags;
    ui.link.dataset.state = s.link;
    ui.linkText.textContent = t(LINK_KEY[s.link]);
    ui.connectPanel.hidden = on;
    ui.disconnectBtn.hidden = !on;
    ui.connectBtn.disabled = s.link === 'connecting' || s.link === 'lost';
    ui.connectBtnText.textContent = t(s.link === 'connecting' || s.link === 'lost' ? LINK_KEY[s.link] : 'connectBtn');

    // 儀表：圓環 = 上下較快的一區，顏色 = 控制溫度等級
    const lv = level(on ? ctrlTemp() : null);
    const pct = on ? Math.max(s.upper || 0, s.lower || 0) : 0;
    document.documentElement.style.setProperty('--tc', lv.color);
    ui.arc.setAttribute('stroke-dasharray', `${pct} 100`);
    ui.arc.style.opacity = pct > 0 ? 1 : 0;
    ui.temp.textContent = on && s.temp !== null ? fmt1(s.temp) : '—';
    ui.level.textContent = lv.text;
    ui.pctUpper.textContent = on && s.upper !== null ? s.upper : '—';
    ui.pctLower.textContent = on && s.lower !== null ? s.lower : '—';
    ui.hum.textContent = on && s.hum !== null ? s.hum : '—';
    ui.feels.textContent = on && s.feels !== null ? fmt1(s.feels) : '—';
    ui.fanIcon.style.animationDuration = pct > 0 ? (1.8 - pct / 100 * 1.5).toFixed(2) + 's' : '1s';
    ui.fanIcon.style.animationPlayState = pct > 0 ? 'running' : 'paused';
    ui.sensorError.hidden = !(on && s.temp === null);
    ui.sensorErrorText.textContent = t('sensorError', { fail: s.cfg.fail });
    ui.hint.textContent = !on ? t('hintIdle')
      : s.auto ? t('hintAuto', { basis: basisText(), t1: s.set.t1, t2: s.set.t2 })
      : t('hintManual');

    // 中暑警示
    const heat = on && (f & FLAG.HEAT);
    ui.heatAlert.hidden = !heat;
    ui.heatAlertTitle.textContent = t('heatTitle', { feels: s.feels !== null ? fmt1(s.feels) : '—' });
    ui.heatAlertText.textContent = t('heatText');
    ui.muteBtn.hidden = !!(f & FLAG.MUTED);

    // 控制
    ui.modeAuto.disabled = ui.modeManual.disabled = !on;
    ui.modeAuto.setAttribute('aria-pressed', s.auto);
    ui.modeManual.setAttribute('aria-pressed', !s.auto);
    for (const [slider, out, v] of [[ui.sliderUpper, ui.outUpper, s.manualUpper], [ui.sliderLower, ui.outLower, s.manualLower]]) {
      slider.disabled = !on || s.auto;
      if (!s.dragging) { slider.value = v; out.textContent = v + '%'; }
      sliderFill(slider);
    }
    ui.sliderNote.textContent = !on ? t('sliderIdle')
      : s.auto ? t('sliderAuto', { boost: s.set.boost })
      : t('sliderManual', { dmin: s.cfg.dmin });

    renderPower(on);
    drawCurve();
    drawHistory();
  }

  function renderPower(on) {
    const s = state, f = s.flags;
    const missing = on && (f & FLAG.POWER_MISSING);
    const has = on && !missing && s.mv !== null;
    const v = has ? s.mv / 1000 : 0, a = has ? Math.max(0, s.ma) / 1000 : 0;
    ui.volts.textContent = has ? v.toFixed(1) : '—';
    ui.amps.textContent = has ? a.toFixed(2) : '—';
    ui.watts.textContent = has ? (v * a).toFixed(1) : '—';
    const batt = has && s.batt !== null ? s.batt : null;
    ui.battPct.textContent = batt !== null ? batt + '%' : '—';
    ui.battFill.style.width = (batt || 0) + '%';
    ui.battFill.style.backgroundColor = batt !== null && batt < 20 ? 'var(--peak)' : batt !== null && batt < 40 ? 'var(--warm)' : 'var(--ok)';
    const h = Math.floor(s.uptime / 60), m = s.uptime % 60;
    const time = (h ? t('hours', { h }) : '') + t('minutes', { m });
    ui.usage.textContent = on ? t('usage', { time, wh: s.wh.toFixed(2) }) : '—';
    ui.powerGrid.style.opacity = missing ? .4 : 1;
    ui.powerNote.hidden = !missing;
    ui.overcurrent.hidden = !(on && (f & FLAG.OVERCURRENT));
    ui.overcurrentText.textContent = t('overcurrent', { amps: (s.cfg.ocMa / 1000).toFixed(1) });
    ui.fanLow.hidden = !(on && (f & FLAG.FAN_LOW));
    ui.fanLowText.textContent = t('fanLow', { ma: has ? Math.round(s.ma) : '—' });
    ui.lowBatt.hidden = !(on && (f & FLAG.LOW_BATT));
    ui.lowBattText.textContent = t('lowBatt', { cap: s.cfg.lowCap });
  }

  function fillSettingsForm() {
    const s = state.set;
    ui.setT0.value = s.t0; ui.setT1.value = s.t1; ui.setT2.value = s.t2; ui.setHeat.value = s.heat;
    ui.setBoost.value = s.boost; ui.outBoost.textContent = s.boost + '%'; sliderFill(ui.setBoost);
    ui.setFeels.checked = s.useFeels; ui.setBuzzer.checked = s.buzzer;
  }

  return { ui, state, FLAG, render, buildCurve, pushHistory, fillSettingsForm, sliderFill, fmt1 };
})();
