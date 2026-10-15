/* ============================================================
   Service Worker：离线缓存策略
   - 应用外壳（HTML/JS/CSS/图标）：网络优先，保证 git push 后
     用户打开即是最新版（迭代友好）
   - 大体积静态资源（vendor/ voices/ 共 ~136MB）：缓存优先，
     首次使用后完全离线可用
   ============================================================ */

const VERSION = 'v1';
const SHELL_CACHE = 'shell-' + VERSION;
const ASSET_CACHE = 'assets-' + VERSION;

const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'colloquial-phrases.js',
  'ielts-data.js',
  'piper-tts.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 第三方请求（云端 TTS 等）直接放行

  // 大体积不可变资产：缓存优先
  if (url.pathname.includes('/vendor/') || url.pathname.includes('/voices/')) {
    e.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 应用外壳：网络优先，失败回退缓存（离线可用）
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
  );
});
