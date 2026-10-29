// 底部分頁：總覽、控制、紀錄、設定（警示與連線區塊在每一頁都看得到）
(() => {
  const tabs = [...document.querySelectorAll('.tabbar [role="tab"]')];
  const views = [...document.querySelectorAll('.view')];
  const store = {
    get() { try { return localStorage.getItem('fv-tab'); } catch (_) { return null; } },
    set(v) { try { localStorage.setItem('fv-tab', v); } catch (_) { /* 只影響記住分頁 */ } },
  };

  function show(id, focus) {
    if (!tabs.some(t => t.dataset.tab === id)) id = 'home';
    for (const t of tabs) {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (const v of views) v.hidden = v.dataset.view !== id;
    store.set(id);
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      const same = t.getAttribute('aria-selected') === 'true';
      show(t.dataset.tab);
      window.scrollTo({ top: 0, behavior: same ? 'smooth' : 'instant' });
    });
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      show(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true);
    });
  });

  show(store.get() || 'home');
})();
