// 團隊模式：一台手機同時連多件背心，依中暑風險排序顯示
(() => {
  const { t } = window.I18N;
  const $ = id => document.getElementById(id);
  const UUID = n => `7a1e000${n}-5c2b-4f0a-9d3e-6b8f2a4c9e10`;
  const SERVICE = UUID(1), STATUS = UUID(2), SETTINGS = UUID(5), EXTRA = UUID(6);
  const INVALID = -32768;
  const demo = new URLSearchParams(location.search).has('demo');
  const members = new Map();  // id -> { id, name, device, link, temp, hum, feels, upper, lower, batt, flags, xflags, hotMin, heat }

  const nicknames = (() => { try { return JSON.parse(localStorage.getItem('fv-team-names') || '{}'); } catch (_) { return {}; } })();
  const saveNames = () => { try { localStorage.setItem('fv-team-names', JSON.stringify(nicknames)); } catch (_) { /* 只影響記住名稱 */ } };

  // 風險等級：3 = 中暑警示、2 = 該喝水／休息或體感偏高、1 = 正常、0 = 斷線
  function risk(m) {
    if (m.link !== 'connected') return 0;
    if (m.flags & 0x48) return 3;  // 中暑或心率過高
    if ((m.xflags & 0x03) || (m.feels !== null && m.feels >= m.heat - 3)) return 2;
    return 1;
  }
  const riskLabel = r => t(['teamOffline', 'teamOk', 'teamCaution', 'teamDangerBadge'][r]);

  function message(m) {
    if (m.link !== 'connected') return t(m.link === 'lost' ? 'linkLost' : 'teamOfflineMsg');
    if (m.flags & 0x08) return t('teamMsgHeat', { feels: m.feels !== null ? m.feels.toFixed(1) : '—' });
    if (m.flags & 0x40) return t('hrAlertTitle', { bpm: m.bpm || '—' });
    if (m.xflags & 0x02) return t('restTitle', { min: m.hotMin });
    if (m.xflags & 0x01) return t('hydrateTitle');
    if (m.flags & 0x02) return t('teamMsgOvercurrent');
    if (m.flags & 0x10) return t('teamMsgLowBatt');
    if (m.temp === null) return t('teamMsgSensor');
    return t('teamMsgOk', { hot: m.hotMin });
  }

  // ---------- 畫面 ----------
  function render() {
    const list = [...members.values()].sort((a, b) => risk(b) - risk(a) || (b.feels ?? 0) - (a.feels ?? 0));
    const box = $('members');
    box.textContent = '';
    for (const m of list) box.append(card(m));
    $('empty').hidden = list.length > 0;
    const live = list.filter(m => m.link === 'connected');
    $('sumCount').textContent = live.length;
    $('sumDanger').textContent = live.filter(m => risk(m) === 3).length;
    const feels = live.map(m => m.feels).filter(v => v !== null);
    $('sumMax').textContent = feels.length ? Math.max(...feels).toFixed(1) : '—';
    document.title = t('teamTitle');
  }

  function card(m) {
    const r = risk(m);
    const sec = document.createElement('section');
    sec.className = 'panel member';
    sec.dataset.risk = r;
    const head = document.createElement('div');
    head.className = 'member-head';
    const h2 = document.createElement('h2');
    h2.textContent = nicknames[m.id] || m.name;
    const badge = document.createElement('span');
    badge.className = 'badge r' + r;
    badge.textContent = riskLabel(r);
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = t('teamRename');
    rename.addEventListener('click', () => {
      const v = window.prompt(t('teamRenamePrompt'), nicknames[m.id] || m.name);
      if (v === null) return;
      if (v.trim()) nicknames[m.id] = v.trim().slice(0, 30); else delete nicknames[m.id];
      saveNames();
      render();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = t('teamRemove');
    remove.addEventListener('click', () => removeMember(m));
    head.append(h2, badge, rename, remove);

    const stats = document.createElement('div');
    stats.className = 'member-stats';
    const on = m.link === 'connected';
    const stat = (label, value, unit) => {
      const d = document.createElement('div');
      d.innerHTML = '<p class="p-label"></p><p class="p-value"><span></span><span class="p-unit"></span></p>';
      d.querySelector('.p-label').textContent = label;
      d.querySelector('.p-value span').textContent = on && value !== null && value !== undefined ? value : '—';
      d.querySelector('.p-unit').textContent = unit;
      return d;
    };
    stats.append(
      stat(t('feelsLike'), m.feels !== null ? m.feels.toFixed(1) : null, '°C'),
      stat(t('hrTitle'), m.bpm || null, 'bpm'),
      stat(t('teamFan'), Math.max(m.upper || 0, m.lower || 0), '%'),
      stat(t('teamBattery'), m.batt, '%'));

    const msg = document.createElement('p');
    msg.className = 'member-msg';
    msg.textContent = message(m);
    sec.append(head, stats, msg);
    return sec;
  }

  // ---------- 藍牙 ----------
  function parseStatus(m, dv) {
    if (dv.byteLength < 20) return;
    const wasHeat = m.flags & 0x48;
    const t10 = v => (v === INVALID ? null : v / 10);
    m.temp = t10(dv.getInt16(0, true));
    const hum = dv.getUint8(2);
    m.hum = hum === 255 ? null : hum;
    m.feels = t10(dv.getInt16(3, true));
    m.upper = dv.getUint8(5);
    m.lower = dv.getUint8(6);
    const batt = dv.getUint8(14);
    m.batt = batt === 255 ? null : batt;
    m.flags = dv.getUint8(15);
    if ((m.flags & 0x48) && !wasHeat && navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
    render();
  }

  async function open(m) {
    const server = await m.device.gatt.connect();
    const svc = await server.getPrimaryService(SERVICE);
    const set = await (await svc.getCharacteristic(SETTINGS)).readValue();
    m.heat = set.getInt16(7, true) / 10;
    const st = await svc.getCharacteristic(STATUS);
    st.addEventListener('characteristicvaluechanged', e => parseStatus(m, e.target.value));
    await st.startNotifications();
    parseStatus(m, await st.readValue());
    try {
      const ex = await svc.getCharacteristic(EXTRA);
      const parseExtra = dv => {
        m.xflags = dv.getUint8(0); m.hotMin = dv.getUint16(1, true);
        m.bpm = dv.byteLength >= 19 && dv.getUint8(16) === 3 ? dv.getUint8(17) : 0;
        render();
      };
      ex.addEventListener('characteristicvaluechanged', e => parseExtra(e.target.value));
      await ex.startNotifications();
      parseExtra(await ex.readValue());
    } catch (_) { /* 舊版韌體沒有 EXTRA */ }
    m.link = 'connected';
    render();
  }

  async function addMember() {
    $('teamError').hidden = true;
    if (demo) return addDemoMember();
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
      if (members.has(device.id)) return;
      const m = { id: device.id, name: device.name || 'FanVest', device, link: 'connecting', temp: null, hum: null,
        feels: null, upper: 0, lower: 0, batt: null, flags: 0, xflags: 0, hotMin: 0, heat: 40 };
      members.set(m.id, m);
      device.addEventListener('gattserverdisconnected', () => reconnect(m));
      render();
      await open(m);
      keepAwake();
    } catch (err) {
      if (err.name === 'NotFoundError') return;
      $('teamError').hidden = false;
      $('teamErrorText').textContent = t('errConnect', { msg: err.message });
      for (const [id, m] of members) if (m.link === 'connecting') members.delete(id);
      render();
    }
  }

  async function reconnect(m) {
    if (m.removed) return;
    m.link = 'lost';
    render();
    for (const wait of [1000, 3000, 8000]) {
      await new Promise(r => setTimeout(r, wait));
      if (m.removed) return;
      try { await open(m); return; } catch (_) { /* 再試 */ }
    }
    m.link = 'idle';
    render();
  }

  function removeMember(m) {
    m.removed = true;
    if (m.device && m.device.gatt && m.device.gatt.connected) m.device.gatt.disconnect();
    if (m.timer) clearInterval(m.timer);
    members.delete(m.id);
    render();
  }

  // ---------- 螢幕保持亮著 ----------
  let wakeLock = null;
  async function keepAwake() {
    try {
      if (!wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (_) { /* 不影響其他功能 */ }
  }
  document.addEventListener('visibilitychange', () => { if (members.size) keepAwake(); });

  // ---------- 示範模式 ----------
  let demoN = 0;
  function addDemoMember() {
    demoN += 1;
    const base = [29, 32, 36, 30.5][demoN % 4];
    const m = { id: 'demo' + demoN, name: `FanVest-D${String(demoN).padStart(3, '0')}`, link: 'connected', temp: base, hum: 60,
      feels: base, upper: 0, lower: 0, batt: 90 - demoN * 7, flags: 0, xflags: 0, hotMin: demoN * 9, heat: 40, clock: demoN * 7 };
    m.timer = setInterval(() => {
      m.clock += 1;
      m.temp = base + 3 * Math.sin(m.clock / 15);
      m.hum = Math.round(62 + 8 * Math.sin(m.clock / 20));
      m.feels = m.temp + Math.max(0, m.hum - 40) * 0.06;
      m.upper = m.feels < 28 ? 0 : Math.min(100, Math.round(30 + (m.feels - 28) * 10));
      m.lower = m.upper ? Math.min(100, m.upper + 10) : 0;
      m.flags = m.feels >= m.heat ? 0x08 : 0;
      if (m.feels >= 32) m.hotMin += 1;
      m.xflags = m.hotMin >= 60 ? 0x02 : m.hotMin % 20 === 0 && m.hotMin ? 0x01 : 0;
      m.bpm = Math.round(Math.min(175, 85 + Math.max(0, m.feels - 30) * 5 + 8 * Math.sin(m.clock / 6)));
      if (m.bpm >= 150) m.flags |= 0x40;
      render();
    }, 1000);
    members.set(m.id, m);
    render();
  }

  // ---------- 初始化 ----------
  $('addBtn').addEventListener('click', addMember);
  $('langBtn').addEventListener('click', () => window.I18N.setLang(window.I18N.lang === 'zh' ? 'en' : 'zh'));
  window.I18N.onChange(render);
  window.I18N.applyStatic();
  if (!demo && !navigator.bluetooth) {
    $('unsupported').hidden = false;
    $('addBtn').disabled = true;
  }
  if (demo) $('foot').textContent = t('demoFoot');
  render();
})();
