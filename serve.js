/* ============================================================
   本地静态服务器
   用途：以 http:// 方式打开站点，避免 file:// 下翻译接口跨域受限、
        localStorage 不稳定的问题。

   运行： node serve.js [端口]
   然后浏览器访问终端里打印的地址。
   ============================================================ */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.data': 'application/octet-stream'
};

// 多线程 WASM(onnxruntime-web / piper_phonemize) 需要 SharedArrayBuffer，
// 浏览器只在“跨源隔离”环境下开放，因此必须返回 COOP/COEP 头。
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, path.normalize(urlPath));

  // 防目录穿越：必须仍在 ROOT 之内
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }, ISOLATION_HEADERS));
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('雅思辅助英文日记 已启动');
  console.log('  → http://localhost:' + PORT + '/');
  console.log('按 Ctrl+C 停止');
});
