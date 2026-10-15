/* ============================================================
   离线英音语音包（Piper TTS，本地自托管）
   ------------------------------------------------------------
   目标：完全不依赖任何外部模型服务，运行时零外网请求。
   所有资产都在本仓库内：
     voices/en_GB-cori-medium.onnx(.json)   英音声学模型
     vendor/piper-tts-web/                  VITS 推理封装
     vendor/piper-wasm/                     音素化 WASM(espeak-ng)
     vendor/onnxruntime-web/                ONNX Runtime WASM

   原理：piper-tts-web 只会去 HuggingFace 拉模型，但它有一层
   OPFS 缓存（readBlob / writeBlob），缓存命中就不再联网。
   因此这里把本地模型预先写进 OPFS，用 HF 的 URL 当缓存键，
   库拿到缓存后即为纯离线运行。

   本文件以 <script type="module"> 加载，并向 window.PiperTTS
   暴露接口供 app.js（普通脚本）调用。
   ============================================================ */

import { TtsSession } from './vendor/piper-tts-web/piper-tts-web.js';

/* ------------------------------------------------------------
   内置离线语音包清单（模型文件在 voices/ 目录，随项目自托管）
   hfPath 仅作为 piper-tts-web 的 OPFS 缓存键前缀，不会真的联网
   ------------------------------------------------------------ */
const HF_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/';

const VOICES = [
  { id: 'en_GB-cori-medium',  label: '英音 · 女声 Cori',   accent: 'GB', gender: 'F', hfPath: 'en/en_GB/cori/medium/' },
  { id: 'en_GB-alan-medium',  label: '英音 · 男声 Alan',   accent: 'GB', gender: 'M', hfPath: 'en/en_GB/alan/medium/' },
  { id: 'en_US-amy-medium',   label: '美音 · 女声 Amy',    accent: 'US', gender: 'F', hfPath: 'en/en_US/amy/medium/' },
  { id: 'en_US-lessac-medium', label: '美音 · 男声 Lessac', accent: 'US', gender: 'M', hfPath: 'en/en_US/lessac/medium/' }
];

const VOICE_STORE_KEY = 'ielts_piper_voice';
const DEFAULT_VOICE_ID = 'en_GB-cori-medium';

function loadVoiceId() {
  let saved = '';
  try { saved = localStorage.getItem(VOICE_STORE_KEY) || ''; } catch (e) { /* 忽略 */ }
  return VOICES.some((v) => v.id === saved) ? saved : DEFAULT_VOICE_ID;
}

let currentVoiceId = loadVoiceId();

function currentVoice() {
  return VOICES.find((v) => v.id === currentVoiceId) || VOICES[0];
}

const BASE = new URL('./', import.meta.url);
const ONNX_DIR = new URL('vendor/onnxruntime-web/', BASE);
const PIPER_WASM = new URL('vendor/piper-wasm/piper_phonemize.wasm', BASE);
const PIPER_DATA = new URL('vendor/piper-wasm/piper_phonemize.data', BASE);

function localModelUrl(voice) { return new URL('voices/' + voice.id + '.onnx', BASE); }
function localConfigUrl(voice) { return new URL('voices/' + voice.id + '.onnx.json', BASE); }

const AUDIO_CACHE_LIMIT = 40;

const audioCache = new Map();   // (voiceId|text) -> objectURL
let session = null;
let sessionVoiceId = '';        // session 当前装载的语音包
let sessionPromise = null;
let status = 'idle';            // idle | loading | ready | error
let lastError = '';
let progressText = '';

/* ------------------------------------------------------------
   能力检测
   ------------------------------------------------------------ */

function detectSupport() {
  if (typeof window === 'undefined') return '当前环境不支持';
  if (location.protocol !== 'http:' && location.protocol !== 'https:') {
    return '需要通过 http:// 访问（请运行 node serve.js），file:// 下无法加载 WASM';
  }
  if (!window.WebAssembly) return '当前浏览器不支持 WebAssembly';
  if (!navigator.storage || !navigator.storage.getDirectory) {
    return '当前浏览器不支持 OPFS 存储（需要较新的 Chrome / Edge）';
  }
  return '';
}

const unsupportedReason = detectSupport();

/* ------------------------------------------------------------
   OPFS：把本地模型预填进库的缓存目录
   ------------------------------------------------------------ */

async function copyToOpfs(dir, cacheKey, sourceUrl, reportProgress) {
  const handle = await dir.getFileHandle(cacheKey, { create: true });

  // 已缓存且体积一致就跳过，避免每次启动都重传 63MB
  try {
    const existing = await handle.getFile();
    if (existing.size > 0) {
      const res = await fetch(sourceUrl, { method: 'HEAD' }).catch(() => null);
      const remote = res && res.headers.get('Content-Length');
      if (!remote || Number(remote) === existing.size) return existing.size;
    }
  } catch (e) { /* 读不到就重新写入 */ }

  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error('读取语音模型失败：HTTP ' + resp.status + '（' + cacheKey + '）');

  const total = Number(resp.headers.get('Content-Length')) || 0;
  const reader = resp.body.getReader();
  const parts = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    if (reportProgress) reportProgress(loaded, total);
  }

  const blob = new Blob(parts);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return blob.size;
}

async function ensureOpfs(voice, onProgress) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('piper', { create: true });

  await copyToOpfs(dir, voice.id + '.onnx.json', localConfigUrl(voice));
  await copyToOpfs(dir, voice.id + '.onnx', localModelUrl(voice), (loaded, total) => {
    progressText = total
      ? '正在装载语音包「' + voice.label + '」' + Math.round(loaded / total * 100) + '%'
      : '正在装载语音包「' + voice.label + '」…';
    if (onProgress) onProgress(loaded, total);
  });
}

/* ------------------------------------------------------------
   会话
   ------------------------------------------------------------ */

function createSession(voice, onProgress) {
  return TtsSession.create({
    voiceId: voice.id,
    wasmPaths: {
      onnxWasm: ONNX_DIR.href,       // 目录，末尾带 /
      piperWasm: PIPER_WASM.href,    // 完整文件地址
      piperData: PIPER_DATA.href
    },
    progress: (p) => {
      if (p && p.url && p.url.indexOf('tts://') === 0) {
        progressText = '正在合成语音 ' + (p.loaded + 1) + '/' + p.total + '…';
      } else if (p && p.total) {
        progressText = '正在装载语音包「' + voice.label + '」' + Math.round(p.loaded / p.total * 100) + '%';
        if (onProgress) onProgress(p.loaded, p.total);
      }
    },
    logger: (msg) => console.log('[piper]', msg)
  });
}

/** 确保引擎就绪（首次调用或切换语音后会装载模型，之后直接复用） */
function init(onProgress) {
  if (unsupportedReason) {
    status = 'error';
    lastError = unsupportedReason;
    return Promise.reject(new Error(unsupportedReason));
  }
  if (session && sessionVoiceId === currentVoiceId) return Promise.resolve(session);
  if (sessionPromise) return sessionPromise;

  const voice = currentVoice();
  status = 'loading';
  lastError = '';
  progressText = '正在装载语音包「' + voice.label + '」…';

  sessionPromise = ensureOpfs(voice, onProgress)
    .then(() => createSession(voice, onProgress))
    .then((s) => {
      session = s;
      sessionVoiceId = voice.id;
      status = 'ready';
      progressText = '';
      return s;
    })
    .catch((e) => {
      sessionPromise = null;
      status = 'error';
      lastError = e && e.message ? e.message : String(e);
      progressText = '';
      throw e;
    });

  return sessionPromise;
}

/* ------------------------------------------------------------
   合成
   ------------------------------------------------------------ */

function cachePut(text, url) {
  if (audioCache.size >= AUDIO_CACHE_LIMIT) {
    const oldest = audioCache.keys().next().value;
    try { URL.revokeObjectURL(audioCache.get(oldest)); } catch (e) { /* 忽略 */ }
    audioCache.delete(oldest);
  }
  audioCache.set(text, url);
}

/* ------------------------------------------------------------
   句群切分与停顿拼接：模拟母语者说话的自然节奏
   - 句末（. ! ?）后停顿约 0.45s
   - 长句中的逗号/分号等意群边界停顿约 0.28s
   ------------------------------------------------------------ */

const PAUSE_SENTENCE = 0.45;   // 句末停顿（秒）
const PAUSE_CLAUSE = 0.28;     // 意群（逗号/分号等）停顿（秒）

/**
 * 把一段文本切成「句群」：
 * 先按句末标点断句；长句（> 90 字符）再在逗号/分号等处断开。
 * 返回 [{ text, pause }] pause = 该组之后插入的停顿时长（秒）
 */
function senseGroups(text) {
  const sentences = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    // 仅当后面跟「空白 + 大写/引号」或已到结尾才算句末（避开 3.5、e.g. 这类情况）
    const m = text.slice(i + 1).match(/^\s*([\s\S])/);
    if (m && !/[A-Z"'“‘(\[]/.test(m[1])) continue;
    if (buf.trim()) sentences.push(buf.trim());
    buf = '';
  }
  if (buf.trim()) sentences.push(buf.trim());

  const groups = [];
  sentences.forEach((sent) => {
    if (sent.length <= 90) {
      groups.push({ text: sent, pause: PAUSE_SENTENCE });
      return;
    }
    // 长句：在 , ; : — 处断成意群（每段尽量 ≥ 30 字符，避免切太碎）
    const parts = sent.split(/(?<=[,;:!?—])\s+/);
    let cur = '';
    parts.forEach((part, i) => {
      cur = cur ? cur + ' ' + part : part;
      const isLast = i === parts.length - 1;
      if (isLast || cur.length >= 30) {
        groups.push({ text: cur, pause: isLast ? PAUSE_SENTENCE : PAUSE_CLAUSE });
        cur = '';
      }
    });
    if (cur.trim()) groups.push({ text: cur, pause: PAUSE_SENTENCE });
  });
  return groups;
}

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx;
}

/** Float32 样本编码成 16bit PCM WAV */
function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, 1, true);              // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate
  view.setUint16(32, 2, true);              // blockAlign
  view.setUint16(34, 16, true);             // bitDepth
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);

  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/x-wav' });
}

/** 逐句群合成，组间插入静音，拼成一个完整 WAV */
async function synthesizeWithPauses(session, text, onProgress) {
  const groups = senseGroups(text);
  if (groups.length <= 1) return session.predict(text);

  const buffers = [];
  for (let i = 0; i < groups.length; i++) {
    progressText = '正在合成语音 ' + (i + 1) + '/' + groups.length + '（句群停顿）…';
    if (onProgress) onProgress(i + 1, groups.length);
    const blob = await session.predict(groups[i].text);
    if (!blob || !blob.size) throw new Error('离线合成返回了空音频');
    const ab = await getAudioCtx().decodeAudioData(await blob.arrayBuffer());
    buffers.push({ buf: ab, pause: groups[i].pause });
  }

  const sampleRate = buffers[0].buf.sampleRate;
  let total = 0;
  buffers.forEach((b) => { total += b.buf.length + Math.round(b.pause * sampleRate); });
  const merged = new Float32Array(total);

  let offset = 0;
  buffers.forEach((b) => {
    merged.set(b.buf.getChannelData(0), offset);
    offset += b.buf.length + Math.round(b.pause * sampleRate);  // 尾部天然是 0（静音）
  });

  return encodeWav(merged, sampleRate);
}

/* 合成串行队列：WASM 推理不可重入，预取下一段与当前合成必须排队执行 */
let speakQueue = Promise.resolve();

async function doSpeak(key, onProgress) {
  const s = await init(onProgress);
  const blob = await synthesizeWithPauses(s, key, onProgress);
  if (!blob || !blob.size) throw new Error('离线合成返回了空音频');

  const url = URL.createObjectURL(blob);
  cachePut(key, url);
  return url;
}

/** 合成一段文本，返回可直接播放的 objectURL（缓存键含语音包，切换语音不会串音） */
function speak(text, onProgress) {
  const key = currentVoiceId + '|' + String(text || '').trim();
  if (key === currentVoiceId + '|') return Promise.reject(new Error('没有可朗读的文本'));
  if (audioCache.has(key)) return Promise.resolve(audioCache.get(key));

  const p = speakQueue.then(() => {
    // 排队期间可能已被其他调用合成并缓存
    if (audioCache.has(key)) return audioCache.get(key);
    return doSpeak(key, onProgress);
  });
  speakQueue = p.catch(() => { /* 队列不因单次失败而中断 */ });
  return p;
}

/* ------------------------------------------------------------
   暴露给 app.js
   ------------------------------------------------------------ */

window.PiperTTS = {
  /** 全部内置语音包：[{ id, label, accent, gender }] */
  voices: VOICES.map((v) => ({ id: v.id, label: v.label, accent: v.accent, gender: v.gender })),

  get voiceId() { return currentVoiceId; },
  get voiceLabel() { return currentVoice().label; },

  /** 切换语音包：下次合成时自动装载对应模型（已合成的缓存不串音） */
  setVoice(id) {
    if (!VOICES.some((v) => v.id === id) || id === currentVoiceId) return false;
    currentVoiceId = id;
    try { localStorage.setItem(VOICE_STORE_KEY, id); } catch (e) { /* 忽略 */ }
    // 旧会话作废，下次 speak/init 时装载新语音包
    session = null;
    sessionVoiceId = '';
    status = 'idle';
    return true;
  },

  /** 环境是否具备离线合成能力（与开关设置无关） */
  supported: !unsupportedReason,
  unsupportedReason: unsupportedReason,

  /** 当前状态：idle | loading | ready | error */
  get status() { return status; },
  get error() { return lastError; },
  get progress() { return progressText; },

  /** 预热：提前装载模型，避免首次朗读时长时间等待 */
  warmup(onProgress) {
    return init(onProgress).then(() => true).catch(() => false);
  },

  speak: speak,

  isCached(text) { return audioCache.has(currentVoiceId + '|' + String(text || '').trim()); }
};

window.dispatchEvent(new CustomEvent('pipertts:ready'));
