// 進階功能：情境模式、喝水提醒、熱暴露、剩餘時間、天氣、匯出、偏好學習、診斷、自我檢測、OTA
(() => {
  const { state, hooks, render, $ } = window.FV;
  const { t } = window.I18N;
  const X = { HYDRATE: 0x01, REST: 0x02, SELF_TEST: 0x04, UPPER_OK: 0x08, LOWER_OK: 0x10, TESTED: 0x20 };
  const send = cmd => window.FV.sendCommand(cmd);
  const fmt1 = window.FV.fmt1;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* 只影響記住設定 */ } },
  };

  // ---------- 情境模式 ----------
  const profileBtns = [...document.querySelectorAll('#profiles button')];
  profileBtns.forEach(b => b.addEventListener('click', () => {
    state.extra.profile = Number(b.dataset.profile);
    render();
    send(Number(b.dataset.profile));
  }));

  // ---------- 喝水提醒 ----------
  $('hydrateBtn').addEventListener('click', () => {
    state.extra.flags &= ~X.HYDRATE;  // 任何控制指令都會讓韌體清除提醒
    render();
    send(255);
  });

  // ---------- 剩餘時間預估 ----------
  const capacity = $('capacity');
  capacity.value = store.get('fv-capacity') || 60;  // 一般空調服電池約 40–100 Wh
  capacity.addEventListener('change', () => { store.set('fv-capacity', capacity.value); render(); });

  function runtimeText() {
    const s = state, cap = Number(capacity.value);
    const watts = s.mv && s.ma > 0 ? s.mv / 1000 * s.ma / 1000 : 0;
    if (!cap || s.mv === null || s.flags & 0x01) return { value: '—', note: t('runtimeNeedSensor') };
    if (watts < 0.3) return { value: t('runtimeIdle'), note: t('runtimeIdleNote') };
    // 有電量（電壓換算）就用剩餘比例，否則用容量減掉本次已用的電
    const left = s.batt !== null ? cap * s.batt / 100 : Math.max(0, cap - s.wh);
    const mins = Math.round(left / watts * 60);
    const h = Math.floor(mins / 60), m = mins % 60;
    return { value: (h ? t('hours', { h }) : '') + t('minutes', { m }), note: t('runtimeNote', { w: watts.toFixed(1) }) };
  }

  // ---------- 天氣（Open-Meteo，免費、不需要帳號） ----------
  let weather = null;
  $('weatherBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { showWeatherError(t('weatherNoGeo')); return; }
    $('weatherBtn').disabled = true;
    $('weatherBtn').textContent = t('weatherLoading');
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude.toFixed(2), lon = pos.coords.longitude.toFixed(2);  // 只取到約 1 公里精度
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,uv_index'
        + '&daily=apparent_temperature_max,uv_index_max&timezone=auto&forecast_days=1';
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        weather = { temp: d.current.temperature_2m, feels: d.current.apparent_temperature,
          uv: d.current.uv_index, maxFeels: d.daily.apparent_temperature_max[0], maxUv: d.daily.uv_index_max[0] };
        render();
      } catch (_) {
        showWeatherError(t('weatherFailed'));
      }
      resetWeatherBtn();
    }, () => { showWeatherError(t('weatherDenied')); resetWeatherBtn(); }, { timeout: 15000, maximumAge: 600000 });
  });
  function resetWeatherBtn() { $('weatherBtn').disabled = false; $('weatherBtn').textContent = t('weatherBtn'); }
  function showWeatherError(msg) { $('weatherWarn').hidden = false; $('weatherWarnText').textContent = msg; }

  function renderWeather() {
    if (!weather) return;
    $('weatherStats').hidden = false;
    $('wxTemp').textContent = fmt1(weather.temp);
    $('wxFeels').textContent = fmt1(weather.feels);
    $('weatherNote').textContent = t('weatherSummary', { uv: Math.round(weather.uv), maxFeels: Math.round(weather.maxFeels), maxUv: Math.round(weather.maxUv) });
    const warn = weather.maxFeels >= 35 ? t('weatherHot', { maxFeels: Math.round(weather.maxFeels) })
      : weather.maxUv >= 8 ? t('weatherUv', { maxUv: Math.round(weather.maxUv) }) : '';
    $('weatherWarn').hidden = !warn;
    $('weatherWarnText').textContent = warn;
  }

  // ---------- 匯出 CSV ----------
  $('exportBtn').addEventListener('click', () => {
    const head = ['time', 'temp_c', 'humidity_pct', 'feels_c', 'upper_pct', 'lower_pct', 'mode', 'voltage_v', 'current_a', 'battery_pct', 'flags', 'profile'];
    const v = x => (x === null || x === undefined ? '' : x);
    const rows = state.log.map(p => [new Date(p.t).toISOString(), v(p.temp), v(p.hum), p.feels === null ? '' : fmt1(p.feels),
      v(p.upper), v(p.lower), p.auto ? 'auto' : 'manual', p.mv ? (p.mv / 1000).toFixed(2) : '', p.ma !== null ? (p.ma / 1000).toFixed(3) : '',
      v(p.batt), '0x' + (p.flags || 0).toString(16), v(p.profile)].join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\n')], { type: 'text/csv' });  // BOM 讓 Excel 正確顯示
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fanvest-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- 設定表單的新欄位 ----------
  const setMax = $('setMax'), outMax = $('outMax');
  setMax.addEventListener('input', () => { outMax.textContent = setMax.value + '%'; window.FV.sliderFill(setMax); });
  $('learnReset').addEventListener('click', () => { send(252); });
  function fillSettings() {
    const s = state.set;
    setMax.value = s.maxPct; outMax.textContent = s.maxPct + '%'; window.FV.sliderFill(setMax);
    $('setHydFeels').value = s.hydFeels;
    $('setHydMin').value = s.hydMin;
    $('setLearn').checked = s.learn;
  }

  // ---------- 自我檢測與 OTA ----------
  $('selfTestBtn').addEventListener('click', () => send(254));
  $('otaBtn').addEventListener('click', () => {
    if (window.confirm(t('otaConfirm'))) send(253);
  });

  function selfTestText() {
    const x = state.extra;
    if (x.flags & X.SELF_TEST) return { cls: 'warn', text: t('selfTestRunning') };
    if (!(x.flags & X.TESTED)) return null;
    const ok = (bit, ma) => (x.flags & bit ? t('selfTestOk', { ma }) : t('selfTestBad', { ma }));
    const allOk = (x.flags & X.UPPER_OK) && (x.flags & X.LOWER_OK);
    return { cls: allOk ? 'ok' : 'err',
      text: `${t('upperSpeed')}：${ok(X.UPPER_OK, x.stUpper)}；${t('lowerSpeed')}：${ok(X.LOWER_OK, x.stLower)}` };
  }

  function renderDiag(on) {
    const s = state, x = s.extra;
    const rows = [
      [t('diagDevice'), on ? (s.deviceName || '—') : '—'],
      [t('diagFirmware'), on ? (x.has ? x.fw : t('diagOldFw')) : '—'],
      [t('diagRaw'), on ? `T=${s.temp !== null ? fmt1(s.temp) : '—'}  H=${s.hum ?? '—'}  feels=${s.feels !== null ? fmt1(s.feels) : '—'}` : '—'],
      [t('diagFans'), on ? `${s.upper ?? '—'}% / ${s.lower ?? '—'}%  (max ${s.set.maxPct}%)` : '—'],
      [t('diagPower'), on ? `${s.mv !== null ? Math.round(s.mv) : '—'} mV  ${s.ma !== null ? Math.round(s.ma) : '—'} mA` : '—'],
      [t('diagFlags'), on ? `0x${s.flags.toString(16).padStart(2, '0')} / 0x${x.flags.toString(16).padStart(2, '0')}` : '—'],
      [t('diagLearn'), on ? `${x.learnShift >= 0 ? '+' : ''}${x.learnShift.toFixed(1)}°C (${x.learnCount})` : '—'],
      [t('diagUptime'), on ? `${s.uptime} min` : '—'],
    ];
    const dl = $('diagList');
    dl.textContent = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    const st = on && x.has ? selfTestText() : null;
    $('selfTestResult').hidden = !st;
    if (st) {
      $('selfTestResult').className = 'notice ' + (st.cls === 'ok' ? '' : st.cls);
      $('selfTestText').textContent = st.text;
    }
    // 指令走 CONTROL 特徵值，不需要 EXTRA；只有自我檢測需要電流感測器
    $('selfTestBtn').disabled = !on || !!(s.flags & 0x01) || !!(x.flags & X.SELF_TEST);
    $('otaBtn').disabled = !on;
    $('diagHint').hidden = !(on && !x.has);
  }

  // ---------- 每次畫面更新 ----------
  function renderFeatures(on) {
    const s = state, x = s.extra, adv = on && x.has;

    // 喝水／休息提醒
    const rest = adv && (x.flags & X.REST), hyd = adv && (x.flags & X.HYDRATE);
    $('hydrateAlert').hidden = !(hyd || rest);
    $('hydrateTitle').textContent = rest ? t('restTitle', { min: x.hotMin }) : t('hydrateTitle');
    $('hydrateText').textContent = rest ? t('restText') : t('hydrateText', { min: s.set.hydMin });

    // 熱暴露
    $('exposurePanel').hidden = !adv;
    $('hotNow').textContent = adv ? x.hotMin : '—';
    $('hotTotal').textContent = adv ? x.totalHotMin : '—';
    $('exposureNote').textContent = t('exposureNote', { feels: s.set.hydFeels, min: s.set.hydMin });

    // 情境模式
    profileBtns.forEach(b => {
      b.disabled = !on;
      b.setAttribute('aria-pressed', adv && Number(b.dataset.profile) === x.profile);
    });
    $('profileNote').textContent = !adv ? (on ? t('profileOldFw') : '') : t('profileNote' + x.profile);

    // 剩餘時間
    const rt = on ? runtimeText() : { value: '—', note: '' };
    $('runtime').textContent = rt.value;
    $('runtimeNote').textContent = rt.note;

    // 偏好學習
    $('learnNote').textContent = !adv ? '' : x.learnCount === 0 ? t('learnNone')
      : t(x.learnShift < 0 ? 'learnEarlier' : 'learnLater', { shift: Math.abs(x.learnShift).toFixed(1), n: x.learnCount });
    $('learnReset').hidden = !adv || x.learnCount === 0;

    $('exportBtn').disabled = s.log.length === 0;
    renderWeather();
    renderDiag(on);
  }
  renderFeatures.fillSettings = fillSettings;
  hooks.push(renderFeatures);
  window.I18N.onChange(() => { resetWeatherBtn(); render(); });

  fillSettings();
  render();
})();
