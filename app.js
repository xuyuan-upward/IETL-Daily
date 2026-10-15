/* ============================================================
   雅思辅助英文日记 — 应用逻辑
   中文 → 英文 → 英音朗读 → 雅思分析 → 生词本/历史
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     通用工具
     ========================================================== */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const debounce = (fn, ms) => {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /** 解码 HTML 实体（免费翻译接口有时会返回 &amp;#39; 这类内容） */
  function decodeEntities(str) {
    const ta = document.createElement('textarea');
    ta.innerHTML = str;
    return ta.value;
  }

  /* ==========================================================
     本地存储
     ========================================================== */

  const KEYS = {
    settings: 'ielts-diary:settings',
    vocab: 'ielts-diary:vocab',
    history: 'ielts-diary:history',
    draft: 'ielts-diary:draft',
    tcache: 'ielts-diary:tcache'
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn('读取本地存储失败:', key, e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('写入本地存储失败:', key, e);
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
    }
  };

  /* ==========================================================
     Toast 提示
     ========================================================== */

  function toast(msg, type, ms) {
    const wrap = $('#toast-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' is-' + type : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 220);
    }, ms || 2600);
  }

  /* ==========================================================
     设置
     ========================================================== */

  const DEFAULT_SETTINGS = {
    engine: 'auto',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: '',
    ttsModel: '',      // 云端 TTS 模型名（留空则用浏览器系统语音）
    ttsVoice: 'alloy', // 云端 TTS 发音人
    offlineTts: true   // 是否启用内置离线英音语音包（优先级最高）
  };

  function getSettings() {
    return Object.assign({}, DEFAULT_SETTINGS, store.get(KEYS.settings, {}));
  }

  function saveSettings(s) {
    store.set(KEYS.settings, s);
  }

  function llmReady(s) {
    return Boolean(s && s.apiKey && s.model && s.baseUrl);
  }

  /* ==========================================================
     Tab 切换
     ========================================================== */

  function initTabs() {
    $$('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.tab;
        $$('.tab').forEach((b) => b.classList.toggle('is-active', b === btn));
        $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'panel-' + name));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function switchTab(name) {
    const btn = $('.tab[data-tab="' + name + '"]');
    if (btn) btn.click();
  }

  /* ==========================================================
     雅思词库构建（自动生成词形变化）
     ========================================================== */

  /** 英式/美式拼写对照，两种都纳入匹配 */
  const BRITISH_VARIANTS = {
    analyze: ['analyse'],
    emphasize: ['emphasise'],
    summarize: ['summarise'],
    utilize: ['utilise'],
    recognize: ['recognise'],
    organize: ['organise'],
    realize: ['realise'],
    minimize: ['minimise'],
    maximize: ['maximise'],
    prioritize: ['prioritise']
  };

  /** 不规则变化 */
  const IRREGULAR = {
    phenomenon: ['phenomena'],
    undergo: ['undergoes', 'underwent', 'undergone', 'undergoing'],
    undertake: ['undertakes', 'undertook', 'undertaken', 'undertaking'],
    obtain: ['obtains', 'obtained', 'obtaining'],
    resemble: ['resembles', 'resembled', 'resembling'],
    reside: ['resides', 'resided', 'residing'],
    circumstance: ['circumstances'],
    insight: ['insights'],
    setback: ['setbacks'],
    strategy: ['strategies'],
    perspective: ['perspectives'],
    implication: ['implications'],
    consequence: ['consequences']
  };

  /** 纯名词后缀：这些词根只生成复数，不生成 -ed / -ing */
  const NOUN_ONLY = /(tion|sion|ment|ness|ity|ism|ist|ics|is)$/;

  /** 辅音+元音+辅音 结尾（需双写末字母，如 stop -> stopping） */
  const CVC = /[^aeiou][aeiou][^aeiouwxy]$/;

  /** 由词根推导常见词形（复数/三单、过去式、现在分词、副词） */
  function buildForms(base) {
    const forms = new Set([base]);

    if (IRREGULAR[base]) {
      IRREGULAR[base].forEach((f) => forms.add(f));
    }

    // 复数 / 第三人称单数
    if (/[^aeiou]is$/.test(base)) forms.add(base.slice(0, -2) + 'es'); // analysis -> analyses
    else if (/(s|x|z|o|ch|sh)$/.test(base)) forms.add(base + 'es');
    else if (/[^aeiou]y$/.test(base)) forms.add(base.slice(0, -1) + 'ies');
    else forms.add(base + 's');

    if (!NOUN_ONLY.test(base)) {
      // 以 e 结尾（非 ee）：去 e 再加后缀（analyse -> analysed / influence -> influencing）
      const dropE = base.endsWith('e') && !base.endsWith('ee');
      const stem = dropE ? base.slice(0, -1) : base;
      const dbl = !dropE && CVC.test(base);

      // 过去式 / 过去分词
      if (dropE) forms.add(stem + 'ed');
      else if (base.endsWith('ee')) forms.add(base + 'd'); // agree -> agreed
      else if (/[^aeiou]y$/.test(base)) forms.add(base.slice(0, -1) + 'ied');
      else if (dbl) forms.add(base + base.slice(-1) + 'ed');
      else forms.add(base + 'ed');

      // 现在分词
      if (dropE) forms.add(stem + 'ing');
      else if (dbl) forms.add(base + base.slice(-1) + 'ing');
      else forms.add(base + 'ing');
    }

    // 副词形式
    if (/^(comprehensive|contemporary|conventional|crucial|diverse|dominant|essential|explicit|fundamental|genuine|inevitable|innovative|intense|legitimate|moderate|obvious|profound|prominent|reluctant|remarkable|significant|sophisticated|spontaneous|substantial|sufficient|superior|tremendous|ultimate|vast|vulnerable|widespread|beneficial|detrimental|deliberate|meaningful|productive|rewarding)$/.test(base)) {
      forms.add(base + 'ly');
      if (base.endsWith('e')) forms.add(base.slice(0, -1) + 'ly');
    }

    return forms;
  }

  /** 词形 -> { p: 词性, m: 释义, base: 词根 } */
  const WORD_MAP = new Map();

  function buildWordMap() {
    ACADEMIC_WORDS.forEach((entry) => {
      const bases = [entry.w].concat(BRITISH_VARIANTS[entry.w] || []);
      bases.forEach((base) => {
        buildForms(base).forEach((form) => {
          if (!WORD_MAP.has(form)) {
            WORD_MAP.set(form, { p: entry.p, m: entry.m, base: entry.w });
          }
        });
      });
    });
  }

  /** 口语高频单词 -> { m: 释义, cat: 类别 }（在练习卡片里以粉色高亮） */
  const COLLO_WORD_MAP = new Map();

  function buildColloWordMap() {
    if (typeof COLLOQUIAL_WORDS === 'undefined') return;
    COLLOQUIAL_WORDS.forEach((entry) => {
      const key = entry.w.toLowerCase();
      if (!COLLO_WORD_MAP.has(key)) {
        COLLO_WORD_MAP.set(key, { m: entry.m, cat: entry.cat });
      }
    });
  }

  /* ==========================================================
     文本切分与雅思分析
     ========================================================== */

  const ABBREV = /^(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|inc|ltd|co|fig|approx|no)$/i;

  /** 把一段文字切成句子（能识别常见缩写，不会误切） */
  function splitSentences(paragraph) {
    const out = [];
    let buf = '';
    for (let i = 0; i < paragraph.length; i++) {
      const ch = paragraph[i];
      buf += ch;
      if (ch !== '.' && ch !== '!' && ch !== '?') continue;

      let j = i + 1;
      while (j < paragraph.length && /\s/.test(paragraph[j])) j++;

      // 到结尾了 -> 断句
      if (j >= paragraph.length) {
        out.push(buf.trim());
        buf = '';
        continue;
      }

      const next = paragraph[j];
      const lastWord = (buf.trim().split(/\s+/).pop() || '').replace(/[.!?]+$/, '').toLowerCase();

      // 下一个字符大写或引号开头，且当前不是缩写 -> 断句
      if (/[A-Z"'“‘(\[]/.test(next) && !ABBREV.test(lastWord)) {
        out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }

  /** 整篇文本 -> 段落数组，每段是句子数组 */
  function paragraphsOf(text) {
    return text
      .split(/\n+/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map((p) => {
        const s = splitSentences(p);
        return s.length ? s : [p];
      });
  }

  /** 展平为句子数组 */
  function flatSentences(text) {
    const out = [];
    paragraphsOf(text).forEach((para) => para.forEach((s) => out.push(s)));
    return out;
  }

  /** 分词（英文单词） */
  function tokenize(text) {
    return text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  }

  /** 雅思写作分析 */
  function analyze(text) {
    const words = tokenize(text);
    const lower = words.map((w) => w.toLowerCase().replace(/^['’-]+|['’-]+$/g, ''));
    const sentences = flatSentences(text);
    const unique = new Set(lower.filter(Boolean));

    // 学术词命中
    const hits = [];
    lower.forEach((w) => {
      if (WORD_MAP.has(w)) hits.push(w);
    });

    // 连接词
    const lc = text.toLowerCase();
    const linkerHits = [];
    LINKERS.forEach((l) => {
      const re = new RegExp('\\b' + escapeRe(l) + '\\b', 'g');
      const m = lc.match(re);
      if (m) { for (let i = 0; i < m.length; i++) linkerHits.push(l); }
    });

    // 复杂句式
    const complexHits = [];
    COMPLEX_PATTERNS.forEach((p) => {
      p.re.lastIndex = 0;
      const m = text.match(p.re);
      if (m) { for (let i = 0; i < m.length; i++) complexHits.push(p.name); }
    });

    const ttr = words.length ? unique.size / words.length : 0;

    return {
      words: words.length,
      sentences: sentences.length,
      avgLen: sentences.length ? Math.round((words.length / sentences.length) * 10) / 10 : 0,
      ttr: Math.round(ttr * 100),
      uniqueWords: unique.size,
      academicHits: hits,
      academicUnique: Array.from(new Set(hits)),
      linkerHits: linkerHits,
      complexHits: complexHits
    };
  }

  /* ==========================================================
     翻译引擎
     ========================================================== */

  /** 智能分段：一整坨无换行的中文日记 → 按「话题/时间流转」切成自然段，
   *  让逐段练习按场景呈现，也让 LLM 有段落结构可保留。 */
  const PARA_BREAK_HINTS = /^(然后|接着|随后|之后|事后|早上|上午|中午|下午|傍晚|晚上|夜里|深夜|到了|回到|回到家|回到宿舍|到公司|到工位|到学校|出门|路上|下班后|放学|吃完饭|吃完|饭后|午休|午睡|睡前|起床后|醒来|洗完澡|回到家后)/;

  function autoSegmentDiary(zh) {
    if (/\n/.test(zh)) return zh;   // 已有换行，尊重用户手动分段
    const sents = zh.split(/(?<=[。！？!?])/).map((s) => s.trim()).filter(Boolean);
    if (sents.length <= 2) return zh;

    const paras = [];
    let cur = '';
    sents.forEach((sent) => {
      const wouldLen = (cur + sent).length;
      if (cur && ((cur.length >= 90 && PARA_BREAK_HINTS.test(sent)) || wouldLen >= 170)) {
        paras.push(cur);
        cur = '';
      }
      cur += sent;
    });
    if (cur) paras.push(cur);
    return paras.length > 1 ? paras.join('\n\n') : zh;
  }

  /** 按段落/句子边界把长文本切成小块（免费接口有长度限制） */
  function chunkText(text, maxLen) {
    const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const chunks = [];
    let cur = '';

    const push = (s) => { if (s.trim()) chunks.push(s.trim()); };

    paras.forEach((para) => {
      if (para.length <= maxLen) {
        if ((cur + '\n' + para).length > maxLen) { push(cur); cur = para; }
        else { cur = cur ? cur + '\n' + para : para; }
        return;
      }
      push(cur); cur = '';
      // 超长段落按句子再切
      const sents = splitSentences(para);
      let buf = '';
      sents.forEach((s) => {
        if ((buf + ' ' + s).trim().length > maxLen) { push(buf); buf = s; }
        else { buf = buf ? buf + ' ' + s : s; }
      });
      push(buf);
    });
    push(cur);
    return chunks;
  }

  /** 带超时的 fetch：避免某个接口不可达时一直「翻译中…」卡死 */
  async function fetchWithTimeout(url, options, ms) {
    const timeout = typeof ms === 'number' ? ms : 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new Error('请求超时（' + Math.round(timeout / 1000) + ' 秒），请检查网络后重试');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 把网络/接口错误翻译成可操作的诊断建议（连通性测试用） */
  function describeNetError(e) {
    const msg = String(e && e.message ? e.message : e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return msg + '（浏览器无法建立连接：检查 Base URL 是否以 https:// 开头、拼写是否正确、当前网络能否访问该域名）';
    }
    if (/HTTP 401|HTTP 403/.test(msg)) return msg + '（API Key 错误、失效或没有权限，请到平台重新生成 Key）';
    if (/HTTP 402/.test(msg)) return msg + '（账户余额不足，请充值后重试）';
    if (/HTTP 404/.test(msg)) return msg + '（接口路径不存在：Base URL 不要自己加 /chat/completions，模型名确认拼写）';
    if (/HTTP 429/.test(msg)) return msg + '（请求太频繁被限流，稍等片刻再试）';
    if (/HTTP 5\d\d/.test(msg)) return msg + '（服务端故障，稍后重试或查看平台状态页）';
    if (/超时/.test(msg)) return msg + '（服务器响应太慢或网络不稳定，可再点一次测试）';
    return msg;
  }

  /** 调用 OpenAI 兼容的 /chat/completions */
  async function llmChat(messages, s, temperature) {
    const url = String(s.baseUrl).replace(/\/+$/, '') + '/chat/completions';
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.apiKey
      },
      body: JSON.stringify({
        model: s.model,
        messages: messages,
        temperature: typeof temperature === 'number' ? temperature : 0.4
      })
    }, 30000);

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 240); } catch (e) { /* 忽略 */ }
      throw new Error('LLM 接口返回 HTTP ' + resp.status + '。' + detail);
    }

    const data = await resp.json();
    const content = data && data.choices && data.choices[0] &&
                    data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('LLM 返回内容为空。');
    return content.trim();
  }

  /** 免费接口一：Google 翻译 gtx（国内通常不可达，短超时快速失败兜底） */
  async function googleTranslate(text) {
    const url = 'https://translate.googleapis.com/translate_a/single' +
                '?client=gtx&sl=zh-CN&tl=en&dt=t&q=' + encodeURIComponent(text);
    const resp = await fetchWithTimeout(url, null, 5000);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('响应格式异常');
    const out = data[0].map((seg) => (seg && seg[0]) ? String(seg[0]) : '').join('');
    if (!out.trim()) throw new Error('译文为空');
    return out;
  }

  /** 免费接口二：MyMemory */
  async function myMemoryTranslate(text) {
    const url = 'https://api.mymemory.translated.net/get?langpair=' +
                encodeURIComponent('zh-CN|en') + '&q=' + encodeURIComponent(text);
    const resp = await fetchWithTimeout(url, null, 15000);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const raw = data && data.responseData && data.responseData.translatedText;
    if (!raw) throw new Error('译文为空');
    if (/MYMEMORY WARNING|INVALID|QUERY LENGTH/i.test(raw)) throw new Error(raw);
    return decodeEntities(raw);
  }

  /** 免费接口三：微软 Edge 翻译（国内可达性好，先取临时令牌，10 分钟内复用） */
  let edgeAuthToken = '';
  let edgeAuthAt = 0;
  async function edgeTranslate(text) {
    if (!edgeAuthToken || Date.now() - edgeAuthAt > 9 * 60 * 1000) {
      const authResp = await fetchWithTimeout('https://edge.microsoft.com/translate/auth', null, 8000);
      if (!authResp.ok) throw new Error('令牌获取失败 HTTP ' + authResp.status);
      edgeAuthToken = (await authResp.text()).trim();
      edgeAuthAt = Date.now();
    }
    const resp = await fetchWithTimeout(
      'https://api-edge.cognitive.microsofttranslator.com/translate?from=zh-Hans&to=en&api-version=3.0',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + edgeAuthToken
        },
        body: JSON.stringify([{ Text: text }])
      }, 15000);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const out = data && data[0] && data[0].translations &&
                data[0].translations[0] && data[0].translations[0].text;
    if (!out) throw new Error('译文为空');
    return String(out);
  }

  /** 并发受限地并行处理数组，保持结果顺序（用于加速多分块翻译） */
  async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let idx = 0;
    const size = Math.max(1, Math.min(limit, items.length));
    const workers = new Array(size).fill(0).map(async () => {
      while (idx < items.length) {
        const cur = idx++;
        results[cur] = await fn(items[cur], cur);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /** 免费翻译（自动分块 + 三接口回退）
   *  各分块并行请求（最多 3 路），每块依次尝试 MyMemory → 微软 Edge → Google gtx，
   *  全部失败时聚合各接口的真实错误，便于定位是网络问题还是配额问题。 */
  async function freeTranslate(zh, onProgress) {
    // 以段落为最小翻译单元，保证中英段落一一对应；超长段落再细分
    const chunks = [];
    zh.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((para) => {
      if (para.length <= 400) chunks.push(para);
      else chunkText(para, 400).forEach((c) => chunks.push(c));
    });
    const used = { myMemory: false, edge: false, google: false };
    let done = 0;

    const results = await mapWithConcurrency(chunks, 3, async (c) => {
      const attempts = [
        { label: 'MyMemory', fn: () => myMemoryTranslate(c), key: 'myMemory' },
        { label: '微软 Edge', fn: () => edgeTranslate(c), key: 'edge' },
        { label: 'Google', fn: () => googleTranslate(c), key: 'google' }
      ];

      let text = null;
      const errs = [];
      for (let i = 0; i < attempts.length; i++) {
        try {
          text = await attempts[i].fn();
          used[attempts[i].key] = true;
          break;
        } catch (e) {
          errs.push(attempts[i].label + ' ' + (e && e.message ? e.message : e));
        }
      }

      done++;
      if (onProgress) onProgress(done, chunks.length);

      if (!text) throw new Error(errs.join('；') || '翻译失败');
      return text;
    });

    const sources = [];
    if (used.myMemory) sources.push('MyMemory');
    if (used.edge) sources.push('微软 Edge');
    if (used.google) sources.push('Google');
    const name = '免费接口（' + (sources.join(' + ') || '未知') + '）';
    return { text: results.join('\n\n'), source: name };
  }

  /* ==========================================================
     翻译缓存：相同文本重复翻译时直接命中本地，省去网络往返
     ========================================================== */

  const TCACHE_LIMIT = 60;

  function tcacheGet(key) {
    const map = store.get(KEYS.tcache, {});
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }

  function tcacheSet(key, value) {
    const map = store.get(KEYS.tcache, {});
    map[key] = value;
    // 超出上限时按插入顺序淘汰最早的条目
    const keys = Object.keys(map);
    while (keys.length > TCACHE_LIMIT) {
      delete map[keys.shift()];
    }
    store.set(KEYS.tcache, map);
  }

  /** 中译英总入口（onProgress 用于多分块时显示进度） */
  async function translateToEnglish(zh, onProgress) {
    const s = getSettings();

    // 0) 命中缓存则直接返回（无网络请求）
    const cacheKey = (llmReady(s) ? 'llm:' + s.model : 'free') + '|' + zh;
    const cached = tcacheGet(cacheKey);
    if (cached) return { text: cached.text, source: cached.source + ' · 缓存' };

    let result = null;

    // 1) 优先用 LLM（雅思风格更好）
    if ((s.engine === 'llm' || s.engine === 'auto') && llmReady(s)) {
      try {
        const text = await llmChat([
          { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
          { role: 'user', content: zh }
        ], s, 0.4);
        result = { text: text, source: 'LLM · ' + s.model };
      } catch (e) {
        if (s.engine === 'llm') throw e;
        console.warn('LLM 翻译失败，回退到免费接口:', e);
        toast('LLM 翻译失败，已回退到免费接口', 'err', 3200);
      }
    } else if (s.engine === 'llm') {
      throw new Error('已选择「仅用 LLM」，但未配置 API Key。请到「设置」页填写。');
    }

    // 2) 免费接口
    if (!result) result = await freeTranslate(zh, onProgress);

    // 3) 写入缓存
    tcacheSet(cacheKey, result);
    return result;
  }

  /* ==========================================================
     云端 TTS：复用 LLM 的 Base URL / API Key，调用 OpenAI 兼容
     的 /audio/speech 接口，自带高质量英音，无需系统语音包。
     ========================================================== */

  const ttsAudioCache = new Map();   // key -> objectURL，避免重复请求同一段音频

  function cloudTtsReady(s) {
    return Boolean(s && s.baseUrl && s.apiKey && s.ttsModel);
  }

  /** 合成一段语音，返回可播放的 objectURL（带缓存与超时） */
  async function synthesizeSpeech(text, s) {
    const voice = s.ttsVoice || 'alloy';
    const key = s.ttsModel + '|' + voice + '|' + text;
    if (ttsAudioCache.has(key)) return ttsAudioCache.get(key);

    const url = String(s.baseUrl).replace(/\/+$/, '') + '/audio/speech';
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.apiKey
      },
      body: JSON.stringify({
        model: s.ttsModel,
        input: text,
        voice: voice,
        response_format: 'mp3'
      })
    }, 30000);

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 200); } catch (e) { /* 忽略 */ }
      throw new Error('TTS 接口返回 HTTP ' + resp.status + '。' + detail);
    }
    const blob = await resp.blob();
    if (!blob || !blob.size) throw new Error('TTS 返回音频为空');
    const objUrl = URL.createObjectURL(blob);

    // 限制缓存条目数量，超出时释放最早的 objectURL
    if (ttsAudioCache.size >= 40) {
      const firstKey = ttsAudioCache.keys().next().value;
      try { URL.revokeObjectURL(ttsAudioCache.get(firstKey)); } catch (e) { /* 忽略 */ }
      ttsAudioCache.delete(firstKey);
    }
    ttsAudioCache.set(key, objUrl);
    return objUrl;
  }

  /* ==========================================================
     离线 TTS：项目内置的 Piper en-GB 语音包，在浏览器本地合成，
     运行时不访问任何外部服务（模型/WASM 全部随项目自托管）。
     引擎由 piper-tts.js 以 ES Module 方式挂载到 window.PiperTTS。
     ========================================================== */

  /** 内置离线语音包是否可用：环境支持 + 用户已开启 + 模块已加载 */
  function offlineTtsAvailable() {
    const p = window.PiperTTS;
    return Boolean(p && p.supported && getSettings().offlineTts !== false);
  }

  /** 装载进度提示（63MB 模型首次装载较慢，需要可见反馈） */
  let lastProgressToast = 0;
  function showTtsProgress() {
    const p = window.PiperTTS;
    if (!p || !p.progress) return;
    const now = Date.now();
    if (now - lastProgressToast < 900) return;
    lastProgressToast = now;
    toast(p.progress, 'info', 1000);
  }

  /** 本地合成一段语音，返回可播放的 objectURL（模块内部已带缓存） */
  function synthesizeOffline(text) {
    return window.PiperTTS.speak(text, showTtsProgress);
  }

  /* ==========================================================
     英音 TTS 播放器
     ========================================================== */

  const TTS = {
    supported: 'speechSynthesis' in window,
    voices: [],       // 候选语音（en-GB 优先）
    voice: null,
    rate: 0.95,
    loop: false,
    queue: [],        // 待读句子
    index: -1,
    state: 'idle',    // idle | playing | paused
    onIndexChange: null,
    wordHook: null,   // 逐词高亮钩子：系统语音 onboundary 时回调 (charIndex, text)
    _restartOnResume: false,
    engine: 'system', // 当前引擎：local（内置离线）| cloud（云端）| system（系统语音）
    _audio: null,     // local / cloud 播放共用的 <audio> 元素
    _token: 0,        // 播放令牌，用于让过期的合成/播放失效

    /** 当前是否走内置离线语音包 */
    isLocal() {
      return offlineTtsAvailable();
    },

    /** 当前是否走云端 TTS（离线不可用时才轮到它） */
    isCloud() {
      return !this.isLocal() && cloudTtsReady(getSettings());
    },

    /** 是否使用 <audio> 播放（离线与云端都是先合成再播放） */
    usesAudio() {
      return this.isLocal() || this.isCloud();
    },

    /** 解析当前引擎，并同步到 this.engine */
    resolveEngine() {
      this.engine = this.isLocal() ? 'local' : (this.isCloud() ? 'cloud' : 'system');
      return this.engine;
    },

    /** 当前引擎对应的合成函数 */
    _synthesizer() {
      return this.isLocal() ? synthesizeOffline : (text) => synthesizeSpeech(text, getSettings());
    },

    /**
     * 段落预取：播放当前段时，后台提前合成下一段。
     * 播完当前段切换时缓存命中，消除「段落间停顿好几秒」的合成空档。
     */
    _prefetch: { text: '', promise: null },

    prefetch(text) {
      if (!text || !this.usesAudio()) return;
      if (this._prefetch.text === text) return;
      const self = this;
      const p = Promise.resolve(this._synthesizer()(text)).catch((e) => {
        console.warn('预取下一段失败:', e);
        if (self._prefetch.promise === p) { self._prefetch.text = ''; self._prefetch.promise = null; }
      });
      this._prefetch = { text: text, promise: p };
    },

    /** 加载语音：先判断离线/云端，再回退系统语音（en-GB 排最前） */
    loadVoices() {
      this.resolveEngine();

      const all = this.supported ? (speechSynthesis.getVoices() || []) : [];

      const isGB = (v) => /^en[-_]GB/i.test(v.lang);
      const isEn = (v) => /^en\b|^en[-_]/i.test(v.lang);

      const gb = all.filter(isGB);
      const otherEn = all.filter((v) => isEn(v) && !isGB(v));

      // en-GB 内部再排序：Google UK 优先，其次 Microsoft 的英音
      const rank = (v) => {
        const n = v.name.toLowerCase();
        if (n.indexOf('google uk english female') >= 0) return 0;
        if (n.indexOf('google uk english male') >= 0) return 1;
        if (/sonia|hazel|ryan|libby|maisie|abbi|bella|ollie/.test(n)) return 2;
        if (v.localService === false) return 3;   // 云端语音音质通常更好
        return 4;
      };
      gb.sort((a, b) => rank(a) - rank(b));

      this.voices = gb.concat(otherEn);
      // 离线语音包与云端 TTS 都自带英音，视为「已有英式语音」，隐藏警告
      this.hasBritish = this.engine !== 'system' || gb.length > 0;

      // 保持用户已选中的语音
      const prev = this.voice && this.voice.voiceURI;
      const stillThere = this.voices.find((v) => v.voiceURI === prev);
      this.voice = stillThere || this.voices[0] || null;

      renderVoiceSelect();
      const warn = $('#voice-warning');
      if (warn) warn.hidden = this.hasBritish;
    },

    setVoice(uri) {
      const v = this.voices.find((x) => x.voiceURI === uri);
      if (v) this.voice = v;
    },

    /**
     * Chrome 在连续朗读约 15 秒后会静默停止。
     * 定时 pause→resume 可重置该计时器，是社区通用规避手段。
     */
    _startKeepAlive() {
      this._stopKeepAlive();
      this._ka = setInterval(() => {
        if (speechSynthesis.speaking && !speechSynthesis.paused) {
          speechSynthesis.pause();
          speechSynthesis.resume();
        }
      }, 10000);
    },

    _stopKeepAlive() {
      if (this._ka) { clearInterval(this._ka); this._ka = null; }
    },

    /** 朗读单段文本（分派到离线 / 云端 / 系统引擎） */
    _speak(text, onEnd) {
      if (!text) { if (onEnd) onEnd(); return; }
      if (this.usesAudio()) this._speakAudio(text, onEnd);
      else this._speakSystem(text, onEnd);
    },

    /** 获取（并复用）合成音频播放用的 <audio> 元素 */
    _getAudio() {
      if (!this._audio) {
        this._audio = new Audio();
        this._audio.preload = 'auto';
      }
      return this._audio;
    },

    /** 按「离线 → 云端 → 系统」的顺序组织可用引擎，再交给 _speakChain */
    _speakAudio(text, onEnd) {
      const chain = [];
      if (this.isLocal()) chain.push('local');
      if (cloudTtsReady(getSettings())) chain.push('cloud');

      // 命中预取：直接复用已在后台合成好的音频，段落衔接零等待
      let prefetched = null;
      if (this._prefetch.text === text && this._prefetch.promise) {
        prefetched = this._prefetch.promise;
        this._prefetch.text = '';
        this._prefetch.promise = null;
      }
      this._speakChain(text, onEnd, chain, '', prefetched);
    },

    /**
     * 合成式引擎（离线 / 云端）的播放实现。
     * 任一环节失败都会降级到 chain 里的下一个引擎，最终回退系统语音，
     * 并把真实错误暴露给用户，避免「点了没声音」的静默失败。
     */
    _speakChain(text, onEnd, chain, firstError, prefetched) {
      const self = this;

      if (!chain.length) {
        if (this.supported && this.voice) {
          if (firstError) toast('朗读失败（' + firstError + '），已回退系统语音', 'err', 4000);
          this._speakSystem(text, onEnd);
        } else {
          toast('朗读失败：' + (firstError || '没有可用的语音引擎'), 'err', 5000);
          if (onEnd) onEnd();
        }
        return;
      }

      const kind = chain[0];
      const label = kind === 'local' ? '离线语音包' : '云端 TTS';
      const synthesize = kind === 'local'
        ? synthesizeOffline
        : function (t) { return synthesizeSpeech(t, getSettings()); };

      const token = ++this._token;
      const audio = this._getAudio();

      (prefetched || synthesize(text)).then((url) => {
        if (token !== self._token) { if (onEnd) onEnd(); return; }  // 已被停止/切句取代
        audio.src = url;
        audio.playbackRate = self.rate;
        audio.onended = function () { if (token === self._token && onEnd) onEnd(); };
        audio.onerror = function () {
          if (token !== self._token) { if (onEnd) onEnd(); return; }
          self._speakChain(text, onEnd, chain.slice(1), firstError || (label + '音频无法播放'));
        };
        return audio.play().catch((playErr) => {
          // play() 被拒（多为浏览器自动播放策略）——明确提示，不静默
          if (token !== self._token) { if (onEnd) onEnd(); return; }
          console.warn(label + '播放被拒:', playErr);
          toast('音频播放被浏览器拦截：' + (playErr && playErr.message ? playErr.message : playErr), 'err', 3200);
          if (onEnd) onEnd();
        });
      }).catch((e) => {
        if (token !== self._token) { if (onEnd) onEnd(); return; }
        const msg = e && e.message ? e.message : String(e);
        console.warn(label + '合成失败:', e);
        // 预取失败：不走降级，用完整链路重新现场合成一次
        if (prefetched) { self._speakChain(text, onEnd, chain, firstError); return; }
        self._speakChain(text, onEnd, chain.slice(1), firstError || (label + '：' + msg));
      });
    },

    /** 系统 Web Speech API 播放 */
    _speakSystem(text, onEnd) {
      if (!this.supported) { if (onEnd) onEnd(); return; }

      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; }
      else { u.lang = 'en-GB'; }
      u.rate = this.rate;
      u.pitch = 1;
      u.volume = 1;

      const self = this;
      u.onend = function () { self._stopKeepAlive(); if (onEnd) onEnd(); };
      // 系统语音的词边界事件：驱动逐词流式高亮（精确到每个单词）
      u.onboundary = function (e) {
        if (typeof e.charIndex === 'number' && self.wordHook) {
          try { self.wordHook(e.charIndex, text); } catch (err) { /* 忽略 */ }
        }
      };
      u.onerror = function (e) {
        self._stopKeepAlive();
        // cancel() 会触发 interrupted/canceled，属正常流程，不当作错误
        if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
        console.warn('TTS 错误:', e);
        if (onEnd) onEnd();
      };

      this._utt = u;

      const doSpeak = function () {
        speechSynthesis.speak(u);
        self._startKeepAlive();
      };

      // Chrome 在 cancel() 之后立刻 speak() 有时会丢弃新任务，需稍等一拍
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
        setTimeout(doSpeak, 60);
      } else {
        doSpeak();
      }
    },

    /** 设置语速（云端播放时可实时生效） */
    setRate(rate) {
      this.rate = rate;
      if (this._audio) { try { this._audio.playbackRate = rate; } catch (e) { /* 忽略 */ } }
    },

    /** 从第 i 句开始顺序播放 */
    playFrom(i) {
      const synth = this.usesAudio();
      if (!synth && !this.supported) { toast('当前浏览器不支持语音合成', 'err'); return; }
      if (!this.queue.length) { toast('没有可朗读的内容', 'err'); return; }
      if (!synth && !this.voice) { toast('未找到可用的英语语音，请检查系统语音包', 'err'); return; }

      ParaPlayers.stop();   // 整篇播放与分段播放互斥
      this.index = Math.max(0, Math.min(i, this.queue.length - 1));
      this.state = 'playing';
      this._restartOnResume = false;
      updatePlayButton();
      this._step();
    },

    _step() {
      if (this.state !== 'playing') return;
      if (this.index >= this.queue.length) {
        if (this.loop) { this.index = 0; }
        else { this.stop(); return; }
      }
      // 整篇播放时跟随该段卡片上设置的倍速
      const para = ParaPlayers.paras[this.index];
      if (para) this.rate = para.rate;
      if (this.onIndexChange) this.onIndexChange(this.index);

      // 整篇播放也启用逐词流式高亮
      const text = this.queue[this.index];
      const card = document.querySelector('#practice-list .practice-card[data-idx="' + this.index + '"]');
      if (SentTracker.attach(card, text)) {
        if (this.usesAudio()) SentTracker.trackAudio();
        else this.wordHook = function (ci) { SentTracker.highlightAtChar(ci); };
      }

      const self = this;
      this._speak(this.queue[this.index], function () {
        if (self.state !== 'playing') return;
        self.index += 1;
        self._step();
      });

      // 播放当前段的同时，后台预合成下一段，消除段落间的合成空档
      const nextIdx = this.index + 1 < this.queue.length ? this.index + 1 : (this.loop ? 0 : -1);
      if (nextIdx >= 0) this.prefetch(this.queue[nextIdx]);
    },

    /** 播放整篇 */
    playAll() {
      if (this.state === 'paused') { this.resume(); return; }
      if (this.state === 'playing' && this.index === 0) { this.pause(); return; }
      this.playFrom(0);
    },

    /** 点击某句播放（再次点击同一句则暂停） */
    playSentence(i) {
      if (this.state === 'playing' && this.index === i) { this.pause(); return; }
      this.playFrom(i);
    },

    /** 朗读单个单词（不影响主队列） */
    speakWord(word) {
      const self = this;
      const savedState = this.state;

      // 合成式引擎（离线 / 云端）：单独合成该单词并播放，读完后恢复主播放
      if (this.usesAudio()) {
        const main = this._audio;
        const synthesize = this._synthesizer();
        const label = this.isLocal() ? '离线语音包' : '云端 TTS';
        if (main) { try { main.pause(); } catch (e) { /* 忽略 */ } }
        synthesize(word).then((url) => {
          const w = new Audio(url);
          w.playbackRate = Math.max(0.6, self.rate - 0.15);
          w.onended = function () {
            if (savedState === 'playing' && self.state === 'playing' && main) {
              main.play().catch(() => {});
            }
          };
          return w.play();
        }).catch((e) => {
          console.warn(label + '朗读单词失败:', e);
          if (self.supported && self.voice) {
            toast(label + '朗读失败，已回退系统语音', 'err', 3000);
            self._speakWordSystem(word, savedState);
          } else {
            toast(label + '朗读失败：' + (e && e.message ? e.message : e), 'err', 3000);
            if (savedState === 'playing' && self.state === 'playing' && main) main.play().catch(() => {});
          }
        });
        return;
      }

      this._speakWordSystem(word, savedState);
    },

    /** 用系统 Web Speech API 朗读单个单词 */
    _speakWordSystem(word, savedState) {
      const self = this;
      if (!this.supported) { toast('当前浏览器不支持语音合成', 'err'); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else { u.lang = 'en-GB'; }
      u.rate = Math.max(0.6, this.rate - 0.15);   // 单词读慢一点，便于模仿
      u.onend = function () {
        // 读完单词后恢复原来的播放状态（从当前句重读）
        if (savedState === 'playing' && self.state === 'playing') self._step();
      };
      // cancel() 之后需稍等一拍，否则 Chrome 可能丢弃这次朗读
      setTimeout(() => speechSynthesis.speak(u), 60);
    },

    pause() {
      if (this.state !== 'playing') return;
      if (this.usesAudio()) {
        if (this._audio) { try { this._audio.pause(); } catch (e) { /* 忽略 */ } }
      } else {
        let ok = false;
        try { speechSynthesis.pause(); ok = speechSynthesis.paused; } catch (e) { ok = false; }
        if (!ok) { speechSynthesis.cancel(); this._restartOnResume = true; }
      }
      this.state = 'paused';
      updatePlayButton();
    },

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      if (this.usesAudio()) {
        // 离线 / 云端：从暂停处继续播放当前句
        if (this._audio && this._audio.src) this._audio.play().catch(() => {});
        else this._step();
      } else if (this._restartOnResume) {
        this._restartOnResume = false;
        this._step();     // 原生 pause 不可用时，从当前句重读
      } else {
        try { speechSynthesis.resume(); } catch (e) { this._step(); }
      }
      updatePlayButton();
    },

    toggle() {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else this.playAll();
    },

    stop() {
      this.state = 'idle';
      this.index = -1;
      this._restartOnResume = false;
      this._token++;   // 让正在进行的云端合成/播放失效
      this._stopKeepAlive();
      this.wordHook = null;
      SentTracker.detach();
      if (this._audio) { try { this._audio.pause(); this._audio.currentTime = 0; } catch (e) { /* 忽略 */ } }
      try { speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
      updatePlayButton();
      if (this.onIndexChange) this.onIndexChange(-1);
    },

    setQueue(sentences) {
      const wasPlaying = this.state === 'playing';
      this.stop();
      this.queue = sentences.slice();
      updateProgress();
      if (wasPlaying && this.queue.length) this.playFrom(0);
    }
  };

  /* ==========================================================
     每段独立播放器
     每段独立拥有：播放 / 暂停、循环开关、倍速（0.5x - 2x）。
     复用 TTS 的合成引擎（离线 Piper / 云端 / 系统语音），
     但维护自己的播放状态，不与整篇播放器互相干扰：
     一方开始时会把另一方停掉。
     ========================================================== */

  /* ==========================================================
     逐句流式高亮（跟读卡拉 OK 效果）
     - 离线 / 云端（合成音频）：没有句边界事件，按「句子字符权重」
       估算每句的起止时间，用 requestAnimationFrame 平滑推进
     - 系统语音：用 onboundary 的 charIndex 定位到句子
     已读句子留浅色底，当前句整句高亮，移动柔和不刺眼。
     ========================================================== */

  const SentTracker = {
    spans: [],      // 当前段落的 .sentence span（与 sents 一一对应）
    sents: [],      // [{ start, end, frac0, frac1 }] 字符偏移 + 时间权重区间
    cur: -1,
    _raf: 0,
    _token: 0,

    /**
     * 绑定某张练习卡片 + 它的朗读文本。
     * 卡片里的 .sentence span 与 splitSentences(text) 的句子按顺序一一对应。
     */
    attach(card, text) {
      this.detach();
      if (!card || !text) return false;

      const spans = Array.from(card.querySelectorAll('.seg-text-en .sentence'));
      const sents = splitSentences(text);
      const n = Math.min(spans.length, sents.length);
      if (!n) return false;

      // 每句在原文里的字符区间（顺序查找，句子来自同一文本，必然按序出现）
      const items = [];
      let from = 0;
      for (let i = 0; i < n; i++) {
        let idx = text.indexOf(sents[i], from);
        if (idx < 0) idx = from;
        items.push({ start: idx, end: idx + sents[i].length });
        from = idx + sents[i].length;
      }

      // 按字符数加权（句间加停顿权重），估算每句的时间区间 [frac0, frac1)
      let total = 0;
      const weights = items.map((it) => {
        const wgt = (it.end - it.start) + 6;            // +6 句间停顿
        total += wgt;
        return wgt;
      });
      let acc = 0;
      items.forEach((it, i) => {
        it.frac0 = acc / total;
        acc += weights[i];
        it.frac1 = acc / total;
      });

      this.spans = spans.slice(0, n);
      this.sents = items;
      this.cur = -1;
      return true;
    },

    /** 音频引擎（离线 / 云端）：等音频就绪后跑 rAF 平滑推进高亮 */
    trackAudio() {
      const token = ++this._token;
      const self = this;
      const waitReady = function (tries) {
        if (token !== self._token) return;
        const a = TTS._audio;
        if (a && a.src && isFinite(a.duration) && a.duration > 0) {
          const tick = function () {
            if (token !== self._token) return;
            if (a.duration > 0) self.highlightAtFraction(a.currentTime / a.duration);
            self._raf = requestAnimationFrame(tick);
          };
          tick();
        } else if (tries < 200) {                        // 最多等约 20s（离线首次合成较慢）
          setTimeout(function () { waitReady(tries + 1); }, 100);
        }
      };
      waitReady(0);
    },

    /** 系统语音：onboundary 给的是字符偏移，定位到所在句 */
    highlightAtChar(ci) {
      if (!this.sents.length) return;
      let idx = this.sents.length - 1;
      for (let i = 0; i < this.sents.length; i++) {
        if (ci < this.sents[i].end) { idx = i; break; }
      }
      this._set(Math.max(0, idx));
    },

    /** 音频引擎：按播放进度比例定位当前句 */
    highlightAtFraction(f) {
      if (!this.sents.length) return;
      let idx = this.sents.length - 1;
      for (let i = 0; i < this.sents.length; i++) {
        if (f < this.sents[i].frac1) { idx = i; break; }
      }
      this._set(Math.max(0, idx));
    },

    /** 设置当前高亮句：之前的句子标记为「已读」，当前句整句高亮 */
    _set(idx) {
      if (idx === this.cur) return;
      this.cur = idx;
      for (let i = 0; i < this.spans.length; i++) {
        const sp = this.spans[i];
        if (i === idx) {
          sp.classList.add('sentence-reading');
          sp.classList.remove('sentence-read');
        } else if (i < idx) {
          sp.classList.remove('sentence-reading');
          sp.classList.add('sentence-read');
        } else {
          sp.classList.remove('sentence-reading', 'sentence-read');
        }
      }
    },

    /** 清除高亮、停止跟踪 */
    detach() {
      this._token++;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
      this.spans.forEach((sp) => sp.classList.remove('sentence-reading', 'sentence-read'));
      this.spans = [];
      this.sents = [];
      this.cur = -1;
    }
  };

  const ParaPlayers = {
    paras: [],        // [{ text, rate, loop }]
    activeIdx: -1,
    state: 'idle',    // idle | playing | paused
    _token: 0,

    /** 文本变化时同步段落内容，但保留每段的倍速/循环设置 */
    sync(paragraphTexts) {
      const old = this.paras;
      const changed = paragraphTexts.length !== old.length ||
        paragraphTexts.some((t, i) => !old[i] || old[i].text !== t);
      if (!changed) return;

      const wasActive = this.state !== 'idle';
      if (wasActive) this.stop();

      this.paras = paragraphTexts.map((t, i) => ({
        text: t,
        rate: old[i] ? old[i].rate : 1,
        loop: old[i] ? old[i].loop : false
      }));
    },

    play(i) {
      if (i < 0 || i >= this.paras.length) return;
      // 再点同一段 = 暂停 / 继续
      if (this.activeIdx === i && this.state === 'playing') { this.pause(); return; }
      if (this.activeIdx === i && this.state === 'paused') { this.resume(); return; }

      TTS.stop();           // 停掉整篇播放，避免两个声音叠在一起
      this.activeIdx = i;
      this.state = 'playing';
      this._speakLoop(++this._token);
    },

    _speakLoop(token) {
      if (this.state !== 'playing' || token !== this._token) return;
      const para = this.paras[this.activeIdx];
      if (!para || !para.text) { this.stop(); return; }
      updateParaUI();

      // 绑定当前段落的逐词高亮
      const card = document.querySelector('#practice-list .practice-card[data-idx="' + this.activeIdx + '"]');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (SentTracker.attach(card, para.text)) {
        if (TTS.usesAudio()) SentTracker.trackAudio();
        else TTS.wordHook = function (ci) { SentTracker.highlightAtChar(ci); };
      }

      const self = this;
      const savedRate = TTS.rate;
      TTS.rate = para.rate;                    // 本段倍速
      if (TTS._audio) { try { TTS._audio.playbackRate = para.rate; } catch (e) { /* 忽略 */ } }

      TTS._speak(para.text, function () {
        TTS.rate = savedRate;                  // 还原全局倍速
        if (self.state !== 'playing' || token !== self._token) return;
        if (self.paras[self.activeIdx] && self.paras[self.activeIdx].loop) {
          self._speakLoop(token);              // 本段循环
        } else if (self.activeIdx + 1 < self.paras.length) {
          self.activeIdx += 1;                 // 没开循环：自动接着播下一段
          self._speakLoop(token);
        } else if (TTS.loop) {
          self.activeIdx = 0;                  // 勾了「循环全文」：回到第一段继续
          self._speakLoop(token);
        } else {
          self.stop();                         // 已是最后一段，结束
        }
      });

      // 播放当前段的同时，后台预合成接下来要播的段落（本段循环则预取本段）
      let nextIdx = -1;
      if (para.loop) nextIdx = self.activeIdx;
      else if (self.activeIdx + 1 < self.paras.length) nextIdx = self.activeIdx + 1;
      else if (TTS.loop) nextIdx = 0;
      if (nextIdx >= 0) TTS.prefetch(self.paras[nextIdx].text);
    },

    pause() {
      if (this.state !== 'playing') return;
      if (TTS.usesAudio()) {
        if (TTS._audio) { try { TTS._audio.pause(); } catch (e) { /* 忽略 */ } }
      } else {
        try { speechSynthesis.pause(); } catch (e) { /* 忽略 */ }
      }
      this.state = 'paused';
      updateParaUI();
    },

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      if (TTS.usesAudio()) {
        if (TTS._audio && TTS._audio.paused) TTS._audio.play().catch(() => {});
      } else {
        try { speechSynthesis.resume(); } catch (e) { /* 忽略 */ }
      }
      updateParaUI();
    },

    stop() {
      this._token++;
      this.state = 'idle';
      this.activeIdx = -1;
      TTS.wordHook = null;
      SentTracker.detach();
      if (TTS._audio) { try { TTS._audio.pause(); TTS._audio.currentTime = 0; } catch (e) { /* 忽略 */ } }
      try { speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
      updateParaUI();
    },

    setRate(i, rate) {
      if (!this.paras[i]) return;
      this.paras[i].rate = rate;
      // 正在播这一段：实时变速
      if (this.activeIdx === i && this.state !== 'idle' && TTS.usesAudio() && TTS._audio) {
        try { TTS._audio.playbackRate = rate; } catch (e) { /* 忽略 */ }
      }
      updateParaUI();
    },

    toggleLoop(i) {
      if (!this.paras[i]) return;
      this.paras[i].loop = !this.paras[i].loop;
      updateParaUI();
    }
  };

  /** 同步每段卡片上的 UI 状态（播放中高亮、循环点亮、按钮文字） */
  function updateParaUI() {
    $$('#practice-list .practice-card').forEach((card) => {
      const i = Number(card.dataset.idx);
      const isActive = ParaPlayers.activeIdx === i && ParaPlayers.state !== 'idle';
      const isPlaying = isActive && ParaPlayers.state === 'playing';
      card.classList.toggle('is-active', isActive);
      const btnPlay = card.querySelector('[data-action="play"]');
      if (btnPlay) btnPlay.innerHTML = isPlaying ? '❚❚ 暂停' : '▶ 播放这一段';
      const btnLoop = card.querySelector('[data-action="loop"]');
      if (btnLoop) btnLoop.classList.toggle('is-on', Boolean(ParaPlayers.paras[i] && ParaPlayers.paras[i].loop));
    });
  }

  /* ==========================================================
     老外高频口语总结
     ========================================================== */

  let currentCollo = [];
  let _colloToken = 0;      // 让过期的 LLM 增强结果失效
  let _colloTimer = 0;      // 防抖

  /** 入口：先出词典检测结果（即时），再自动触发 LLM 增强（异步补充） */
  function renderCollo() {
    const box = $('#collo-list');
    if (!box) return;

    const text = ($('#en-output').value || '').trim();
    _colloToken++;
    clearTimeout(_colloTimer);

    if (!text) {
      currentCollo = [];
      renderColloList();
      return;
    }

    // 1) 词典检测：即时展示（已支持动词变形匹配）
    currentCollo = typeof detectColloquialisms === 'function' ? detectColloquialisms(text) : [];
    renderColloList();

    // 2) LLM 自动增强：配置了 Key 就自动补充词典没覆盖的地道表达
    const s = getSettings();
    if (llmReady(s)) {
      _colloTimer = setTimeout(() => enhanceColloWithLLM(text), 1200);
    }
  }

  /** 纯渲染 currentCollo：三列表格（中文意思 | English chunk | 例句） */
  function renderColloList(statusText) {
    const box = $('#collo-list');
    const countEl = $('#collo-count');
    if (!box) return;
    box.innerHTML = '';

    if (countEl) {
      countEl.textContent = currentCollo.length + ' 个表达' + (statusText ? ' · ' + statusText : '');
    }

    if (!currentCollo.length) {
      const text = ($('#en-output').value || '').trim();
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = text
        ? '没有检测到高频口语表达。试试用 "ended up"、"to be honest"、"a bit of a"、"knackered" 这类说法替换书面语。'
        : '翻译完成后，这里会以「中文意思 + English chunk + 例句」的形式列出这篇日记里的地道口语句块。';
      box.appendChild(p);
      return;
    }

    const table = document.createElement('div');
    table.className = 'chunk-table';

    const thead = document.createElement('div');
    thead.className = 'chunk-row chunk-head';
    ['中文意思', 'English chunk', 'Example sentence'].forEach((h) => {
      const c = document.createElement('div');
      c.textContent = h;
      thead.appendChild(c);
    });
    table.appendChild(thead);

    currentCollo.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'chunk-row' + (item.ai ? ' chunk-row-ai' : '');
      row.dataset.idx = String(i);
      row.title = '点击听例句朗读';

      // 中文意思（AI 条目带上来源标记）
      const zh = document.createElement('div');
      zh.className = 'chunk-zh';
      zh.textContent = item.meaning;
      if (item.ai) {
        const badge = document.createElement('span');
        badge.className = 'collo-ai-badge';
        badge.textContent = 'AI';
        badge.title = '由大模型从原文中补充提取';
        zh.appendChild(badge);
      }
      row.appendChild(zh);

      // English chunk（加粗）+ 命中次数
      const chunk = document.createElement('div');
      chunk.className = 'chunk-en';
      chunk.textContent = item.display;
      if (item.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'collo-count';
        cnt.textContent = '×' + item.count;
        chunk.appendChild(cnt);
      }
      row.appendChild(chunk);

      // 例句（来自日记原文）
      const eg = document.createElement('div');
      eg.className = 'chunk-eg';
      eg.textContent = item.example || '—';
      row.appendChild(eg);

      table.appendChild(row);
    });

    box.appendChild(table);
  }

  /**
   * LLM 自动增强：让大模型从原文里找出词典没收录的地道口语表达，
   * 与词典结果合并（词典命中优先，AI 结果带标记）。
   */
  async function enhanceColloWithLLM(text) {
    const s = getSettings();
    if (!llmReady(s)) return;
    const token = ++_colloToken;
    renderColloList('AI 增强中…');

    const prompt =
      'You are a British English coach helping a Chinese learner. ' +
      'From the diary below, extract expressions that native British speakers really use every day ' +
      '(phrasal verbs, filler phrases, idioms, slang, natural collocations). ' +
      'ONLY extract expressions that actually appear in the text (inflected forms count). Do NOT invent. ' +
      'For each: give a concise Chinese meaning, and quote the FULL sentence from the diary that contains it. ' +
      'Reply with a JSON array ONLY, no markdown, no explanation: ' +
      '[{"phrase":"...","meaning":"...","example":"原文中的完整句子"}]\n\n日记原文：\n' + text;

    try {
      const raw = await llmChat([{ role: 'user', content: prompt }], s, 0.2);
      if (token !== _colloToken) return;

      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start < 0 || end <= start) { renderColloList(); return; }

      const arr = JSON.parse(raw.slice(start, end + 1));
      if (!Array.isArray(arr)) { renderColloList(); return; }

      const seen = new Set(currentCollo.map((it) =>
        (typeof normalizeColloKey === 'function' ? normalizeColloKey(it.display) : it.display.toLowerCase())
      ));
      let added = 0;
      arr.forEach((it) => {
        const phrase = String(it.phrase || '').trim();
        const meaning = String(it.meaning || '').trim();
        if (!phrase || !meaning) return;
        const key = typeof normalizeColloKey === 'function' ? normalizeColloKey(phrase) : phrase.toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);

        // 例句：优先用模型引用的原句；缺失时在原文里定位该表达所在的句子
        let example = String(it.example || '').trim();
        if (!example && typeof sentenceAt === 'function') {
          const at = text.toLowerCase().indexOf(phrase.toLowerCase());
          if (at >= 0) example = sentenceAt(text, at);
        }

        currentCollo.push({
          display: phrase,
          meaning: meaning,
          cat: '地道表达',
          count: 1,
          example: example,
          ai: true
        });
        added += 1;
      });

      renderColloList(added ? 'AI 已补充 ' + added + ' 条' : undefined);
    } catch (e) {
      if (token !== _colloToken) return;
      console.warn('AI 口语增强失败:', e);
      renderColloList();   // 静默失败：保留词典结果
    }
  }

  /* ==========================================================
     练习卡片渲染
     ========================================================== */

  function renderVoiceSelect() {
    const sel = $('#voice-select');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    const hint = $('#engine-hint');

    // 内置离线语音包：列出全部本地发音人（英/美音 × 男/女声），可直接切换
    if (TTS.isLocal()) {
      const p = window.PiperTTS;
      (p.voices || []).forEach((v) => {
        const opt = document.createElement('option');
        opt.value = '__local__:' + v.id;
        opt.textContent = '📦 ' + v.label;
        sel.appendChild(opt);
      });
      sel.value = '__local__:' + p.voiceId;
      sel.disabled = false;
      if (hint) hint.innerHTML = '当前发音引擎：📦 <b>内置离线语音包 · ' + p.voiceLabel + '</b> ✓ 完全离线，可自由切换发音人';
      return;
    }

    // 云端 TTS：显示当前使用的云端发音人，不再依赖系统语音包
    if (TTS.isCloud()) {
      const s = getSettings();
      const opt = document.createElement('option');
      opt.value = '__cloud__';
      opt.textContent = '☁️ 云端英音 · ' + (s.ttsVoice || 'alloy') + '（' + s.ttsModel + '）';
      sel.appendChild(opt);
      sel.value = '__cloud__';
      sel.disabled = true;   // 云端发音人在「设置」页配置
      if (hint) hint.innerHTML = '当前发音引擎：☁️ <b>云端 TTS · ' + (s.ttsVoice || 'alloy') + '</b>（' + s.ttsModel + '）';
      return;
    }

    if (!TTS.voices.length) {
      const opt = document.createElement('option');
      opt.textContent = TTS.supported ? '未检测到语音包' : '浏览器不支持语音合成';
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;

    let gbGroup = null, otherGroup = null;
    TTS.voices.forEach((v) => {
      const isGB = /^en[-_]GB/i.test(v.lang);
      let group = isGB ? gbGroup : otherGroup;
      if (!group) {
        group = document.createElement('optgroup');
        group.label = isGB ? '🇬🇧 英式英语 (en-GB)' : '其他英语语音';
        sel.appendChild(group);
        if (isGB) gbGroup = group; else otherGroup = group;
      }
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = v.name + '  (' + v.lang + (v.localService ? '' : ' · 云端') + ')';
      group.appendChild(opt);
    });

    sel.value = (TTS.voice && TTS.voice.voiceURI) || prev || '';

    if (hint) {
      if (TTS.voice) {
        const isGB = /^en[-_]GB/i.test(TTS.voice.lang);
        hint.innerHTML = '当前发音引擎：💻 <b>系统语音 · ' + TTS.voice.name + '（' + TTS.voice.lang + '）</b>' +
          (isGB ? ' ✓ 英式发音' : ' ⚠ 不是英音语音包，建议开启内置离线英音');
      } else {
        hint.textContent = '';
      }
    }
  }

  /** 渲染一个句子：把命中的学术词包成可点击的 span */
  function renderSentence(text, idx, savedWords) {
    const span = document.createElement('span');
    span.className = 'sentence';
    span.dataset.idx = String(idx);
    span.title = '点击朗读这一句';

    // 按「单词 / 非单词」切分，保留原始标点空格
    const parts = text.split(/([A-Za-z][A-Za-z'’-]*)/g);

    parts.forEach((part) => {
      if (!part) return;
      if (/^[A-Za-z]/.test(part)) {
        const key = part.toLowerCase();
        const collo = COLLO_WORD_MAP.get(key);
        const hit = collo || WORD_MAP.get(key);
        const w = document.createElement('span');
        w.className = 'word' + (hit ? ' word-hit' : '') +
          (collo ? ' word-collo' : '') +
          (hit && savedWords.has(key) ? ' word-saved' : '');
        w.textContent = part;
        if (hit) {
          w.dataset.word = key;
          w.dataset.pos = collo ? collo.cat : hit.p;
          w.dataset.meaning = hit.m;
          w.title = (collo ? collo.cat : hit.p) + ' ' + hit.m + '　（点击查看 / 朗读）';
        }
        span.appendChild(w);
      } else {
        span.appendChild(document.createTextNode(part));
      }
    });

    return span;
  }

  /** 中英段落对齐：中文第 N 段对应英文第 N 段（翻译 prompt 已要求保留分段） */
  function alignParagraphs(zh, en) {
    const zp = zh.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const ep = en.split(/\n+/).map((s) => s.trim()).filter(Boolean);

    // LLM 偶尔不守段落约定：英文段数少于中文时，
    // 反复把最长的英文段从中间句子处拆开，直到数量对齐
    let guard = 0;
    while (ep.length < zp.length && guard++ < 30) {
      let idx = 0;
      for (let i = 1; i < ep.length; i++) if (ep[i].length > ep[idx].length) idx = i;
      const sents = ep[idx].split(/(?<=[.!?])\s+/).filter(Boolean);
      if (sents.length < 2) break;
      const mid = Math.ceil(sents.length / 2);
      ep.splice(idx, 1, sents.slice(0, mid).join(' '), sents.slice(mid).join(' '));
    }
    return ep.map((e, i) => ({ zh: zp[i] || '', en: e }));
  }

  /** 渲染「中文 + 英文逐段练习」卡片（每段：CN 中文 + GB 英文 + 播放/停止/循环/倍速） */
  function renderPracticeCards() {
    const list = $('#practice-list');
    if (!list) return;
    const zh = ($('#zh-input').value || '').trim();
    const en = ($('#en-output').value || '').trim();
    list.innerHTML = '';
    closeWordPop();

    if (!en) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '先在上方写好中文日记，点击「✨ 生成英文日记」，这里会按段落生成中英对照练习卡片。';
      list.appendChild(p);
      if (!TTS.queue.length) TTS.setQueue([]);
      updateParaUI();
      return;
    }

    const pairs = alignParagraphs(zh, en);
    const savedWords = vocabSet();
    let sentIdx = 0;

    pairs.forEach((pair, i) => {
      const card = document.createElement('div');
      card.className = 'practice-card';
      card.dataset.idx = String(i);

      // —— CN 中文理解 ——
      if (pair.zh) {
        const segZh = document.createElement('div');
        segZh.className = 'seg seg-zh';
        const tagZh = document.createElement('span');
        tagZh.className = 'seg-tag';
        tagZh.innerHTML = '<i>CN</i> 中文理解';
        segZh.appendChild(tagZh);
        const pZh = document.createElement('p');
        pZh.className = 'seg-text';
        pZh.textContent = pair.zh;
        segZh.appendChild(pZh);
        card.appendChild(segZh);
      }

      // —— GB English · 现在时口语 ——
      const segEn = document.createElement('div');
      segEn.className = 'seg seg-en';
      segEn.title = '点击播放这一段';
      const tagEn = document.createElement('span');
      tagEn.className = 'seg-tag seg-tag-en';
      tagEn.innerHTML = '<i>GB</i> English · 现在时口语';
      segEn.appendChild(tagEn);
      const pEn = document.createElement('p');
      pEn.className = 'seg-text seg-text-en';
      const sents = splitSentences(pair.en);
      (sents.length ? sents : [pair.en]).forEach((s) => {
        pEn.appendChild(renderSentence(s, sentIdx, savedWords));
        pEn.appendChild(document.createTextNode(' '));
        sentIdx += 1;
      });
      segEn.appendChild(pEn);
      card.appendChild(segEn);

      // —— 控制行：播放 / 停止 / 循环 / 倍速 ——
      const controls = document.createElement('div');
      controls.className = 'seg-controls';

      const btnPlay = document.createElement('button');
      btnPlay.className = 'btn btn-pink btn-sm para-ctl';
      btnPlay.dataset.action = 'play';
      btnPlay.innerHTML = '▶ 播放这一段';
      controls.appendChild(btnPlay);

      const btnStop = document.createElement('button');
      btnStop.className = 'btn btn-soft btn-sm para-ctl';
      btnStop.dataset.action = 'stop';
      btnStop.innerHTML = '■ 停止';
      controls.appendChild(btnStop);

      const btnLoop = document.createElement('button');
      btnLoop.className = 'btn btn-soft btn-sm para-ctl para-loop';
      btnLoop.dataset.action = 'loop';
      btnLoop.title = '循环播放本段';
      btnLoop.innerHTML = '🔁 循环';
      controls.appendChild(btnLoop);

      // 本段倍速滑条：拖动实时生效
      const curRate = (ParaPlayers.paras[i] && ParaPlayers.paras[i].rate) || 1;
      const rateWrap = document.createElement('span');
      rateWrap.className = 'rate-slider para-rate-slider';
      rateWrap.title = '本段倍速（拖动实时生效）';
      const rateInput = document.createElement('input');
      rateInput.type = 'range';
      rateInput.className = 'para-rate';
      rateInput.min = '0.5';
      rateInput.max = '2';
      rateInput.step = '0.05';
      rateInput.value = String(curRate);
      const rateVal = document.createElement('b');
      rateVal.className = 'rate-val';
      rateVal.textContent = curRate.toFixed(2) + '×';
      rateWrap.appendChild(rateInput);
      rateWrap.appendChild(rateVal);
      controls.appendChild(rateWrap);

      card.appendChild(controls);
      list.appendChild(card);
    });

    // 文本没变就不重置播放队列，避免打断正在进行的朗读
    const newQueue = pairs.map((p) => p.en);
    const sameQueue = newQueue.length === TTS.queue.length &&
      newQueue.every((t, i) => TTS.queue[i] === t);
    if (!sameQueue) TTS.setQueue(newQueue);

    updateParaUI();
  }

  /** 整篇播放时高亮当前段落卡片 */
  function highlightParagraph(i) {
    $$('#practice-list .practice-card').forEach((card) => {
      card.classList.toggle('is-playing', Number(card.dataset.idx) === i);
    });
    if (i >= 0) {
      const el = $('#practice-list .practice-card.is-playing');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    updateProgress();
  }

  function updateProgress() {
    const txt = $('#play-progress');
    if (!txt) return;
    const total = TTS.queue.length;
    const cur = TTS.index >= 0 ? TTS.index + 1 : 0;
    txt.textContent = (TTS.state !== 'idle' && total) ? ('第 ' + cur + ' / ' + total + ' 段') : '';
  }

  function updatePlayButton() {
    const btn = $('#btn-play-all');
    if (!btn) return;
    if (TTS.state === 'playing') {
      btn.innerHTML = '❚❚ 暂停';
      btn.title = '暂停';
      btn.classList.add('is-playing');
    } else {
      btn.innerHTML = '▶ 播放全文';
      btn.title = TTS.state === 'paused' ? '继续播放' : '从头播放全文';
      btn.classList.remove('is-playing');
    }
    updateProgress();
  }

  /* ==========================================================
     单词弹窗（释义 + 朗读 + 收藏）
     ========================================================== */

  let popEl = null;

  function closeWordPop() {
    if (popEl) { popEl.remove(); popEl = null; }
  }

  function showWordPop(target) {
    closeWordPop();
    const word = target.dataset.word;
    const pos = target.dataset.pos || '';
    const meaning = target.dataset.meaning || '';
    const saved = vocabSet().has(word);

    popEl = document.createElement('div');
    popEl.className = 'word-pop';

    const head = document.createElement('div');
    head.className = 'word-pop-head';

    const w = document.createElement('span');
    w.className = 'word-pop-word';
    w.textContent = word;
    head.appendChild(w);

    if (pos) {
      const p = document.createElement('span');
      p.className = 'vocab-pos';
      p.textContent = pos;
      head.appendChild(p);
    }
    popEl.appendChild(head);

    const m = document.createElement('div');
    m.className = 'word-pop-meaning';
    m.textContent = meaning;
    popEl.appendChild(m);

    const actions = document.createElement('div');
    actions.className = 'word-pop-actions';

    const btnSpeak = document.createElement('button');
    btnSpeak.className = 'btn btn-ghost btn-sm';
    btnSpeak.textContent = '🔊 朗读';
    btnSpeak.addEventListener('click', (e) => { e.stopPropagation(); TTS.speakWord(word); });
    actions.appendChild(btnSpeak);

    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-sm ' + (saved ? 'btn-ghost' : 'btn-primary');
    btnAdd.textContent = saved ? '✓ 已在生词本' : '＋ 加入生词本';
    btnAdd.disabled = saved;
    btnAdd.addEventListener('click', (e) => {
      e.stopPropagation();
      addVocab(word, pos, meaning);
      btnAdd.textContent = '✓ 已加入';
      btnAdd.disabled = true;
      btnAdd.className = 'btn btn-sm btn-ghost';
      target.classList.add('word-saved');
      closeWordPop();
    });
    actions.appendChild(btnAdd);

    popEl.appendChild(actions);
    document.body.appendChild(popEl);

    // 定位到被点单词附近
    const r = target.getBoundingClientRect();
    const pw = popEl.offsetWidth, ph = popEl.offsetHeight;
    let left = r.left + window.scrollX + r.width / 2 - pw / 2;
    let top = r.bottom + window.scrollY + 8;
    left = Math.max(10, Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - 10));
    if (r.bottom + ph + 16 > window.innerHeight) {
      top = r.top + window.scrollY - ph - 8;
    }
    popEl.style.left = left + 'px';
    popEl.style.top = top + 'px';
  }

  /* ==========================================================
     生词本
     ========================================================== */

  function getVocab() { return store.get(KEYS.vocab, []); }
  function vocabSet() { return new Set(getVocab().map((v) => v.word)); }

  function addVocab(word, pos, meaning) {
    const list = getVocab();
    if (list.some((v) => v.word === word)) { toast('「' + word + '」已在生词本中'); return; }
    list.unshift({ word: word, pos: pos || '', meaning: meaning || '', addedAt: Date.now() });
    store.set(KEYS.vocab, list);
    renderVocab();
    toast('已加入生词本：' + word, 'ok');
  }

  function removeVocab(word) {
    store.set(KEYS.vocab, getVocab().filter((v) => v.word !== word));
    renderVocab();
    renderPracticeDebounced();
  }

  function renderVocab() {
    const list = getVocab();
    const box = $('#vocab-list');
    const badge = $('#vocab-count');
    const kw = ($('#vocab-search').value || '').trim().toLowerCase();
    if (badge) badge.textContent = String(list.length);
    box.innerHTML = '';

    const filtered = kw
      ? list.filter((v) => v.word.indexOf(kw) >= 0 || (v.meaning || '').toLowerCase().indexOf(kw) >= 0)
      : list;

    if (!filtered.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = kw ? '没有匹配「' + kw + '」的单词。'
        : '生词本是空的。在「英音朗读」区域点击高亮的学术词汇即可收藏。';
      box.appendChild(p);
      return;
    }

    filtered.forEach((v) => {
      const item = document.createElement('div');
      item.className = 'vocab-item';

      const w = document.createElement('span');
      w.className = 'vocab-word';
      w.textContent = v.word;
      item.appendChild(w);

      if (v.pos) {
        const p = document.createElement('span');
        p.className = 'vocab-pos';
        p.textContent = v.pos;
        item.appendChild(p);
      }

      const g = document.createElement('span');
      g.className = 'vocab-gloss';
      g.textContent = v.meaning || '—';
      item.appendChild(g);

      const acts = document.createElement('div');
      acts.className = 'vocab-actions';

      const btnSpeak = document.createElement('button');
      btnSpeak.className = 'icon-btn';
      btnSpeak.textContent = '🔊';
      btnSpeak.title = '朗读（英音）';
      btnSpeak.addEventListener('click', () => TTS.speakWord(v.word));
      acts.appendChild(btnSpeak);

      const btnCopy = document.createElement('button');
      btnCopy.className = 'icon-btn';
      btnCopy.textContent = '⧉';
      btnCopy.title = '复制';
      btnCopy.addEventListener('click', () => copyText(v.word + '  ' + (v.pos || '') + '  ' + (v.meaning || '')));
      acts.appendChild(btnCopy);

      const btnDel = document.createElement('button');
      btnDel.className = 'icon-btn is-del';
      btnDel.textContent = '✕';
      btnDel.title = '删除';
      btnDel.addEventListener('click', () => removeVocab(v.word));
      acts.appendChild(btnDel);

      item.appendChild(acts);
      box.appendChild(item);
    });
  }

  /* ==========================================================
     历史日记
     ========================================================== */

  function getHistory() { return store.get(KEYS.history, []); }

  /** 生成日期标签：2026年10月14日 星期三 21:05 */
  function formatDateLabel(d) {
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日' +
      ' 星期' + weekDays[d.getDay()] + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function saveDiary() {
    const zh = ($('#zh-input').value || '').trim();
    const en = ($('#en-output').value || '').trim();
    if (!en) { toast('英文内容为空，无法保存', 'err'); return; }

    const now = new Date();
    const a = analyze(en);
    const phrases = (typeof detectColloquialisms === 'function' ? detectColloquialisms(en) : [])
      .map((x) => ({ display: x.display, meaning: x.meaning, cat: x.cat, count: x.count }));

    const list = getHistory();
    const titleSrc = en.split(/[.!?]/)[0].trim();
    list.unshift({
      id: uid(),
      date: now.toISOString(),
      dateLabel: formatDateLabel(now),
      title: (titleSrc.slice(0, 60) + (titleSrc.length > 60 ? '…' : '')) || '无标题',
      zh: zh,
      en: en,
      phrases: phrases,
      stats: {
        words: a.words,
        sentences: a.sentences,
        academic: a.academicUnique.length,
        ttr: a.ttr
      }
    });
    store.set(KEYS.history, list);
    renderHistory();
    toast('日记已保存 · 生成日期 ' + formatDateLabel(now), 'ok', 3500);
  }

  function renderHistory() {
    const list = getHistory();
    const box = $('#history-list');
    const badge = $('#history-count');
    if (badge) badge.textContent = String(list.length);
    box.innerHTML = '';

    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '还没有保存过日记。写完英文后点击「💾 保存日记」。';
      box.appendChild(p);
      return;
    }

    list.forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'history-item';

      const head = document.createElement('div');
      head.className = 'history-head';

      const title = document.createElement('div');
      title.className = 'history-title';
      title.textContent = item.title;
      head.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'history-meta';
      const d = new Date(item.date);
      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date-badge';
      dateSpan.textContent = '📅 ' + (item.dateLabel || formatDateLabel(d));
      meta.appendChild(dateSpan);
      const wSpan = document.createElement('span');
      wSpan.textContent = (item.stats ? item.stats.words : 0) + ' 词';
      meta.appendChild(wSpan);
      if (item.phrases && item.phrases.length) {
        const pSpan = document.createElement('span');
        pSpan.textContent = item.phrases.length + ' 个口语表达';
        meta.appendChild(pSpan);
      }
      const arrow = document.createElement('span');
      arrow.textContent = '▾';
      meta.appendChild(arrow);
      head.appendChild(meta);

      head.addEventListener('click', () => wrap.classList.toggle('is-open'));
      wrap.appendChild(head);

      const body = document.createElement('div');
      body.className = 'history-body';

      if (item.zh) {
        const b1 = document.createElement('div');
        b1.className = 'history-block';
        const l1 = document.createElement('div');
        l1.className = 'history-label';
        l1.textContent = '中文原文';
        const c1 = document.createElement('div');
        c1.className = 'history-zh';
        c1.textContent = item.zh;
        b1.appendChild(l1); b1.appendChild(c1);
        body.appendChild(b1);
      }

      const b2 = document.createElement('div');
      b2.className = 'history-block';
      const l2 = document.createElement('div');
      l2.className = 'history-label';
      l2.textContent = '英文';
      const c2 = document.createElement('div');
      c2.className = 'history-en';
      c2.textContent = item.en;
      b2.appendChild(l2); b2.appendChild(c2);
      body.appendChild(b2);

      if (item.phrases && item.phrases.length) {
        const bp = document.createElement('div');
        bp.className = 'history-block';
        const lp = document.createElement('div');
        lp.className = 'history-label';
        lp.textContent = '高频口语（' + item.phrases.length + '）';
        bp.appendChild(lp);
        const chips = document.createElement('div');
        chips.className = 'history-phrases';
        item.phrases.forEach((ph) => {
          const chip = document.createElement('span');
          chip.className = 'history-phrase-chip';
          chip.textContent = ph.display;
          chip.title = ph.meaning;
          chip.addEventListener('click', () => TTS.speakWord(ph.display));
          chips.appendChild(chip);
        });
        bp.appendChild(chips);
        body.appendChild(bp);
      }

      const b3 = document.createElement('div');
      b3.className = 'history-block';
      const acts = document.createElement('div');
      acts.className = 'history-actions';

      const btnLoad = document.createElement('button');
      btnLoad.className = 'btn btn-ghost btn-sm';
      btnLoad.textContent = '载入到编辑器';
      btnLoad.addEventListener('click', () => {
        $('#zh-input').value = item.zh || '';
        $('#en-output').value = item.en;
        refreshAll();
        switchTab('write');
        toast('已载入', 'ok');
      });
      acts.appendChild(btnLoad);

      const btnPlay = document.createElement('button');
      btnPlay.className = 'btn btn-ghost btn-sm';
      btnPlay.textContent = '🔊 英音朗读';
      btnPlay.addEventListener('click', () => {
        $('#en-output').value = item.en;
        refreshAll();
        switchTab('write');
        setTimeout(() => TTS.playFrom(0), 120);
      });
      acts.appendChild(btnPlay);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-ghost btn-sm btn-danger';
      btnDel.textContent = '删除';
      btnDel.addEventListener('click', () => {
        store.set(KEYS.history, getHistory().filter((x) => x.id !== item.id));
        renderHistory();
      });
      acts.appendChild(btnDel);

      b3.appendChild(acts);
      body.appendChild(b3);

      wrap.appendChild(body);
      box.appendChild(wrap);
    });
  }

  /* ==========================================================
     剪贴板
     ========================================================== */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast('已复制到剪贴板', 'ok'))
        .catch(() => copyFallback(text));
    } else {
      copyFallback(text);
    }
  }

  function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板', 'ok'); }
    catch (e) { toast('复制失败，请手动选择', 'err'); }
    ta.remove();
  }

  /* ==========================================================
     刷新
     ========================================================== */

  const renderPracticeDebounced = debounce(renderPracticeCards, 400);

  function refreshAll() {
    // 先把英文按段落喂给播放器（保留每段的倍速/循环设置），再渲染卡片
    ParaPlayers.sync(
      paragraphsOf(($('#en-output').value || '').trim())
        .map((sents) => sents.join(' '))
    );
    renderPracticeCards();
    renderCollo();
    saveDraft();
  }

  function saveDraft() {
    store.set(KEYS.draft, {
      zh: $('#zh-input').value,
      en: $('#en-output').value,
      at: Date.now()
    });
  }

  function loadDraft() {
    const d = store.get(KEYS.draft, null);
    if (d && (d.zh || d.en)) {
      $('#zh-input').value = d.zh || '';
      $('#en-output').value = d.en || '';
    }
  }

  /* ==========================================================
     事件绑定
     ========================================================== */

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      btn.dataset.origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> ' + (busyText || '处理中…');
    } else {
      btn.disabled = false;
      if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
    }
  }

  function bindEvents() {
    const zhEl = $('#zh-input');
    const enEl = $('#en-output');

    // 字数统计
    zhEl.addEventListener('input', () => {
      $('#zh-count').textContent = (zhEl.value || '').replace(/\s/g, '').length + ' 字';
      saveDraft();
    });

    // 英文编辑 -> 实时刷新分析 + 朗读区 + 口语总结 + 分段播放器
    enEl.addEventListener('input', debounce(() => {
      refreshAll();
    }, 500));

    // 翻译
    $('#btn-translate').addEventListener('click', async () => {
      let zh = zhEl.value.trim();
      if (!zh) { toast('请先输入中文内容', 'err'); return; }

      // 一整坨无换行的日记 → 智能分段，让逐段练习按场景呈现
      const segmented = autoSegmentDiary(zh);
      if (segmented !== zh) {
        zh = segmented;
        zhEl.value = segmented;
        saveDraft();
        toast('已自动按话题分段（可直接在文本框调整换行）', 'ok', 3000);
      }

      const btn = $('#btn-translate');
      setBusy(btn, true, '翻译中…');
      $('#translate-source').textContent = '翻译中…';

      try {
        const r = await translateToEnglish(zh, (done, total) => {
          if (total > 1) $('#translate-source').textContent = '翻译中 ' + done + '/' + total + ' 段…';
        });
        enEl.value = r.text;
        $('#translate-source').textContent = '来源：' + r.source + ' · ' +
          new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        refreshAll();
        toast('翻译完成（' + r.source + '）', 'ok');
        const wrap = $('#practice-wrap');
        if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        console.error(e);
        $('#translate-source').textContent = '翻译失败';
        let failMsg = String(e.message || e);
        if (!llmReady(getSettings())) {
          failMsg += '。小提示：在「设置」中配置 LLM 接口（如 DeepSeek），翻译会更快更稳定';
        }
        toast('翻译失败：' + failMsg, 'err', 6000);
      } finally {
        setBusy(btn, false);
      }
    });

    // 复制英文
    $('#btn-copy-en').addEventListener('click', () => {
      const en = enEl.value.trim();
      if (!en) { toast('没有可复制的内容', 'err'); return; }
      copyText(en);
    });

    // 示例 / 清空
    $('#btn-sample').addEventListener('click', () => {
      zhEl.value = SAMPLE_DIARY;
      $('#zh-count').textContent = SAMPLE_DIARY.replace(/\s/g, '').length + ' 字';
      saveDraft();
      toast('已填入示例日记', 'ok');
    });

    $('#btn-clear-zh').addEventListener('click', () => {
      zhEl.value = '';
      $('#zh-count').textContent = '0 字';
      saveDraft();
    });

    // 保存日记
    $('#btn-save').addEventListener('click', saveDiary);

    // 全文播放控制
    $('#btn-play-all').addEventListener('click', () => TTS.toggle());
    $('#btn-stop-all').addEventListener('click', () => { TTS.stop(); ParaPlayers.stop(); });
    $('#loop-all').addEventListener('change', (e) => { TTS.loop = e.target.checked; });

    // 全文倍速滑条：拖动实时生效，同步所有段落的滑条与倍速
    $('#rate-all').addEventListener('input', (e) => {
      const r = parseFloat(e.target.value);
      if (!isFinite(r)) return;
      const label = r.toFixed(2) + '×';
      const allVal = $('#rate-all-val');
      if (allVal) allVal.textContent = label;
      TTS.setRate(r);
      ParaPlayers.paras.forEach((p) => { p.rate = r; });
      $$('#practice-list .para-rate').forEach((sl) => {
        sl.value = String(r);
        const lab = sl.parentElement && sl.parentElement.querySelector('.rate-val');
        if (lab) lab.textContent = label;
      });
    });

    $('#voice-select').addEventListener('change', (e) => {
      const val = e.target.value;
      // 内置离线语音包：走 PiperTTS 切换（与系统语音的 voiceURI 区分开）
      if (val.indexOf('__local__:') === 0 && window.PiperTTS) {
        if (window.PiperTTS.setVoice(val.slice('__local__:'.length))) {
          toast('发音人切换为：' + window.PiperTTS.voiceLabel + '（首次播放需装载模型，稍候片刻）', 'ok', 2600);
          renderVoiceSelect();
        }
        return;
      }
      TTS.setVoice(val);
      if (TTS.state === 'playing') TTS.playFrom(TTS.index);
      toast('发音人：' + (TTS.voice ? TTS.voice.name : '未选择'));
    });

    // 逐段练习卡片：播放/停止/循环/倍速 + 单词弹窗（事件委托）
    const pl = $('#practice-list');
    pl.addEventListener('click', (e) => {
      // 1) 点到高亮单词 -> 弹释义框
      const wordEl = e.target.closest('.word-hit');
      if (wordEl) {
        e.stopPropagation();
        if (popEl && popEl._for === wordEl) { closeWordPop(); return; }
        showWordPop(wordEl);
        popEl._for = wordEl;
        return;
      }
      const card = e.target.closest('.practice-card');
      if (!card) return;
      const idx = Number(card.dataset.idx);

      // 2) 点到控制按钮 -> 播放 / 停止 / 循环
      const ctl = e.target.closest('[data-action]');
      if (ctl) {
        const act = ctl.dataset.action;
        if (act === 'play') ParaPlayers.play(idx);
        else if (act === 'stop') { ParaPlayers.stop(); TTS.stop(); }
        else if (act === 'loop') ParaPlayers.toggleLoop(idx);
        return;
      }

      // 3) 点到英文区域 -> 播放这一段
      if (e.target.closest('.seg-en')) {
        closeWordPop();
        ParaPlayers.play(idx);
      }
    });
    // 每段倍速滑条：拖动实时生效（input 事件，松手即调好）
    pl.addEventListener('input', (e) => {
      const sl = e.target.closest('input.para-rate');
      if (!sl) return;
      const card = e.target.closest('.practice-card');
      if (!card) return;
      const r = parseFloat(sl.value);
      if (!isFinite(r)) return;
      const lab = sl.parentElement && sl.parentElement.querySelector('.rate-val');
      if (lab) lab.textContent = r.toFixed(2) + '×';
      ParaPlayers.setRate(Number(card.dataset.idx), r);
    });

    // 重点口语句块表格：点击行朗读例句（没有例句则读句块本身）
    $('#collo-list').addEventListener('click', (e) => {
      const row = e.target.closest('.chunk-row');
      if (!row || row.classList.contains('chunk-head')) return;
      const item = currentCollo[Number(row.dataset.idx)];
      if (item) TTS.speakWord(item.example || item.display);
    });

    // 一键把本篇高频口语全部加入生词本
    $('#btn-add-collo-vocab').addEventListener('click', () => {
      if (!currentCollo.length) { toast('还没有检测到口语表达，先完成翻译', 'err'); return; }
      let added = 0;
      currentCollo.forEach((item) => {
        const list = getVocab();
        if (!list.some((v) => v.word === item.display.toLowerCase())) {
          list.unshift({
            word: item.display.toLowerCase(),
            pos: item.cat,
            meaning: item.meaning,
            addedAt: Date.now()
          });
          store.set(KEYS.vocab, list);
          added++;
        }
      });
      renderVocab();
      toast(added ? '已加入 ' + added + ' 个口语表达到生词本' : '这些表达都已在生词本里了', 'ok');
    });

    // 点击空白处关闭单词弹窗
    document.addEventListener('click', (e) => {
      if (popEl && !popEl.contains(e.target) && !e.target.closest('.word-hit')) closeWordPop();
    });
    window.addEventListener('resize', closeWordPop);

    // 生词本
    $('#vocab-search').addEventListener('input', debounce(renderVocab, 200));

    $('#btn-clear-vocab').addEventListener('click', () => {
      if (!getVocab().length) { toast('生词本已经是空的'); return; }
      if (!confirm('确定清空生词本？此操作不可撤销。')) return;
      store.set(KEYS.vocab, []);
      renderVocab();
      renderPracticeCards();
      toast('生词本已清空', 'ok');
    });

    $('#btn-export-vocab').addEventListener('click', () => {
      const list = getVocab();
      if (!list.length) { toast('生词本是空的', 'err'); return; }
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ielts-vocab-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('已导出生词本', 'ok');
    });

    // 历史
    $('#btn-clear-history').addEventListener('click', () => {
      if (!getHistory().length) { toast('还没有历史日记'); return; }
      if (!confirm('确定删除全部历史日记？此操作不可撤销。')) return;
      store.set(KEYS.history, []);
      renderHistory();
      toast('历史已清空', 'ok');
    });

    // 设置
    $('#btn-save-settings').addEventListener('click', () => {
      const s = {
        engine: $('#set-engine').value,
        baseUrl: $('#set-baseurl').value.trim() || DEFAULT_SETTINGS.baseUrl,
        apiKey: $('#set-apikey').value.trim(),
        model: $('#set-model').value.trim(),
        ttsModel: $('#set-tts-model').value.trim(),
        ttsVoice: $('#set-tts-voice').value.trim() || DEFAULT_SETTINGS.ttsVoice,
        offlineTts: $('#set-offline-tts').checked
      };
      saveSettings(s);
      TTS.loadVoices();   // 立即刷新朗读引擎（离线 / 云端 / 系统）
      renderOfflineTtsStatus();
      const msg = $('#settings-msg');
      const parts = [];
      parts.push(llmReady(s)
        ? '翻译用 LLM（' + s.model + '），口语表达更地道'
        : '翻译用免费接口（未填完整 LLM 配置）');
      parts.push(TTS.isLocal()
        ? '朗读用内置离线语音包（' + window.PiperTTS.voiceLabel + '）'
        : (cloudTtsReady(s)
          ? '朗读用云端英音（' + s.ttsVoice + ' / ' + s.ttsModel + '）'
          : '朗读用浏览器系统语音'));
      msg.textContent = '✓ 已保存。' + parts.join('；') + '。';
      msg.style.color = 'var(--ok)';
      toast('设置已保存', 'ok');
    });

    $('#btn-test-llm').addEventListener('click', async () => {
      const s = {
        baseUrl: $('#set-baseurl').value.trim() || DEFAULT_SETTINGS.baseUrl,
        apiKey: $('#set-apikey').value.trim(),
        model: $('#set-model').value.trim()
      };
      const msg = $('#settings-msg');
      if (!llmReady(s)) {
        msg.textContent = '✗ 请先填写 Base URL、API Key 和模型名。';
        msg.style.color = 'var(--danger)';
        return;
      }
      const btn = $('#btn-test-llm');
      setBusy(btn, true, '测试中…');
      msg.textContent = '正在请求…';
      msg.style.color = 'var(--muted)';
      try {
        const reply = await llmChat([
          { role: 'user', content: 'Reply with exactly: OK' }
        ], s, 0);
        msg.textContent = '✓ 连通成功。模型返回：' + reply.slice(0, 60);
        msg.style.color = 'var(--ok)';
      } catch (e) {
        msg.textContent = '✗ 连接失败：' + describeNetError(e);
        msg.style.color = 'var(--danger)';
      } finally {
        setBusy(btn, false);
      }
    });

    $('#btn-test-tts').addEventListener('click', async () => {
      const s = {
        baseUrl: $('#set-baseurl').value.trim() || DEFAULT_SETTINGS.baseUrl,
        apiKey: $('#set-apikey').value.trim(),
        ttsModel: $('#set-tts-model').value.trim(),
        ttsVoice: $('#set-tts-voice').value.trim() || DEFAULT_SETTINGS.ttsVoice
      };
      const msg = $('#settings-msg');
      if (!cloudTtsReady(s)) {
        msg.textContent = '✗ 请先填写 Base URL、API Key 和 TTS 模型名。';
        msg.style.color = 'var(--danger)';
        return;
      }
      const btn = $('#btn-test-tts');
      setBusy(btn, true, '合成中…');
      msg.textContent = '正在合成语音…';
      msg.style.color = 'var(--muted)';
      try {
        const url = await synthesizeSpeech('Hello, this is a British English voice test.', s);
        const a = new Audio(url);
        a.play().catch(() => {});
        msg.textContent = '✓ 云端 TTS 可用，正在播放测试语音（' + s.ttsVoice + '）。';
        msg.style.color = 'var(--ok)';
      } catch (e) {
        msg.textContent = '✗ 云端 TTS 失败：' + (e && e.message ? e.message : e);
        msg.style.color = 'var(--danger)';
      } finally {
        setBusy(btn, false);
      }
    });

    // 离线语音包：开关切换即时刷新状态提示（生效仍需点「保存设置」）
    $('#set-offline-tts').addEventListener('change', renderOfflineTtsStatus);

    // 预载并试听内置离线英音
    $('#btn-warmup-tts').addEventListener('click', async () => {
      if (!window.PiperTTS) { toast('离线语音模块尚未加载完成，请稍后再试', 'err'); return; }
      const btn = $('#btn-warmup-tts');
      setBusy(btn, true, '装载中…');
      renderOfflineTtsStatus();
      const timer = setInterval(renderOfflineTtsStatus, 500);
      const ok = await window.PiperTTS.warmup(showTtsProgress);
      clearInterval(timer);
      setBusy(btn, false);
      renderOfflineTtsStatus();

      if (!ok) {
        toast('离线语音包装载失败：' + (window.PiperTTS.error || '未知错误'), 'err', 5000);
        return;
      }
      try {
        const url = await synthesizeOffline('Hello, this is a British English voice test.');
        const a = new Audio(url);
        a.playbackRate = TTS.rate;
        a.play().catch(() => {});
        toast('离线语音包（' + window.PiperTTS.voiceLabel + '）可用，正在试听', 'ok');
      } catch (e) {
        toast('试听失败：' + (e && e.message ? e.message : e), 'err', 5000);
      }
    });

    // 离线语音模块（ESM）加载完成后，重新判定引擎并刷新界面
    window.addEventListener('pipertts:ready', () => {
      TTS.loadVoices();
      renderOfflineTtsStatus();
      const warn = $('#voice-warning');
      if (warn && TTS.hasBritish) warn.hidden = true;
      const play = $('#btn-play-all');
      if (play && TTS.usesAudio()) play.disabled = false;
    });

    // 离开页面前停止朗读
    window.addEventListener('beforeunload', () => {
      try { speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
      try { if (TTS._audio) TTS._audio.pause(); } catch (e) { /* 忽略 */ }
    });

    // 快捷键：Ctrl+Enter 翻译，Ctrl+S 保存
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#btn-translate').click();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDiary();
      }
    });
  }

  /* ==========================================================
     初始化
     ========================================================== */

  /** 设置页：显示内置离线语音包的当前状态 */
  function renderOfflineTtsStatus() {
    const el = $('#offline-tts-status');
    if (!el) return;
    const p = window.PiperTTS;

    if (!p) {
      el.textContent = '… 离线语音模块加载中，请稍候。';
      el.style.color = 'var(--muted)';
      return;
    }
    if (!p.supported) {
      el.textContent = '✗ 当前环境不可用：' + p.unsupportedReason;
      el.style.color = 'var(--danger)';
      return;
    }

    let text, color = 'var(--muted)';
    if (p.status === 'ready') { text = '✓ 语音包已装载，可完全离线朗读。'; color = 'var(--ok)'; }
    else if (p.status === 'loading') { text = '… ' + (p.progress || '正在装载语音包…'); }
    else if (p.status === 'error') { text = '✗ 装载失败：' + p.error; color = 'var(--danger)'; }
    else { text = '○ 语音包已随项目就位，首次朗读时自动装载。'; }

    el.textContent = text;
    el.style.color = color;
  }

  function initSettingsUI() {
    const s = getSettings();
    $('#set-engine').value = s.engine;
    $('#set-baseurl').value = s.baseUrl;
    $('#set-apikey').value = s.apiKey;
    $('#set-model').value = s.model;
    $('#set-tts-model').value = s.ttsModel || '';
    $('#set-tts-voice').value = s.ttsVoice || DEFAULT_SETTINGS.ttsVoice;
    $('#set-offline-tts').checked = s.offlineTts !== false;
    renderOfflineTtsStatus();
  }

  function init() {
    buildWordMap();
    buildColloWordMap();
    initTabs();
    initSettingsUI();
    loadDraft();
    bindEvents();

    // 初始字数
    $('#zh-count').textContent = ($('#zh-input').value || '').replace(/\s/g, '').length + ' 字';

    // TTS
    TTS.onIndexChange = highlightParagraph;
    TTS.loadVoices();
    if (TTS.supported) {
      speechSynthesis.onvoiceschanged = () => TTS.loadVoices();
      // 部分浏览器首次加载语音列表有延迟，补一次
      setTimeout(() => TTS.loadVoices(), 400);
      setTimeout(() => TTS.loadVoices(), 1200);
    } else if (!TTS.usesAudio()) {
      // 系统语音、离线语音包、云端 TTS 全不可用
      const sel = $('#voice-select');
      if (sel) { sel.disabled = true; sel.innerHTML = '<option>浏览器不支持语音合成</option>'; }
      const warn = $('#voice-warning');
      if (warn) {
        warn.hidden = false;
        warn.innerHTML = '⚠ 当前浏览器不支持 Web Speech API，且离线语音包与云端 TTS 均不可用。请使用较新的 Chrome / Edge 并通过 <code>node serve.js</code> 访问，或到「设置」页填入云端 TTS 模型。';
      }
      $('#btn-play-all').disabled = true;
    }

    renderVocab();
    renderHistory();
    refreshAll();

    // file:// 协议下 localStorage / fetch 可能受限，给出提示
    if (location.protocol === 'file:') {
      setTimeout(() => {
        toast('提示：以本地服务器方式打开（如 npx serve）可获得更稳定的翻译与存储体验', null, 6000);
      }, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
