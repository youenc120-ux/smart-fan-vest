// 離線快取：開過一次之後，戶外沒有網路也能打開控制頁（藍牙本身不需要網路）
const CACHE = 'fanvest-v5';
const SHELL = ['./', 'index.html', 'style.css', 'i18n.js', 'ui.js', 'app.js', 'features.js', 'team.html', 'team.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 先用網路拿最新版，失敗再用快取
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
