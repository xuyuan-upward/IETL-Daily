/* ============================================================
   雅思辅助英文日记 — 数据层
   学术词库 / 连接词 / 复杂句式模式 / 示例文本
   ============================================================ */

/**
 * 雅思学术词库（AWL 高频 + 写作加分词）
 * w = 词根（原形）, p = 词性, m = 中文释义
 * 运行时会自动生成常见词形变化（复数/过去式/进行时/副词等）
 */
const ACADEMIC_WORDS = [
  { w: "analyze",        p: "v.",  m: "分析" },
  { w: "approach",       p: "n./v.", m: "方法；着手处理" },
  { w: "assume",         p: "v.",  m: "假定；认为" },
  { w: "attribute",      p: "v./n.", m: "归因于；属性" },
  { w: "beneficial",     p: "adj.", m: "有益的" },
  { w: "challenge",      p: "n./v.", m: "挑战；质疑" },
  { w: "circumstance",   p: "n.",  m: "情况；环境" },
  { w: "clarify",        p: "v.",  m: "阐明；澄清" },
  { w: "comprehensive",  p: "adj.", m: "全面的；综合的" },
  { w: "consequence",    p: "n.",  m: "后果；结果" },
  { w: "considerable",   p: "adj.", m: "相当大的；重要的" },
  { w: "constitute",     p: "v.",  m: "构成；组成" },
  { w: "contemporary",   p: "adj.", m: "当代的；同时代的" },
  { w: "contribute",     p: "v.",  m: "贡献；促成" },
  { w: "controversial",  p: "adj.", m: "有争议的" },
  { w: "conventional",   p: "adj.", m: "传统的；常规的" },
  { w: "crucial",        p: "adj.", m: "至关重要的" },
  { w: "demonstrate",    p: "v.",  m: "证明；演示" },
  { w: "detrimental",    p: "adj.", m: "有害的" },
  { w: "diminish",       p: "v.",  m: "减少；削弱" },
  { w: "diverse",        p: "adj.", m: "多样的；不同的" },
  { w: "dominant",       p: "adj.", m: "主导的；占优势的" },
  { w: "drastically",    p: "adv.", m: "剧烈地；大幅地" },
  { w: "elaborate",      p: "v./adj.", m: "详述；精心制作的" },
  { w: "eliminate",      p: "v.",  m: "消除；淘汰" },
  { w: "emphasize",      p: "v.",  m: "强调" },
  { w: "enhance",        p: "v.",  m: "提升；增强" },
  { w: "ensure",         p: "v.",  m: "确保" },
  { w: "essential",      p: "adj.", m: "必要的；本质的" },
  { w: "establish",      p: "v.",  m: "建立；确立" },
  { w: "evaluate",       p: "v.",  m: "评估；评价" },
  { w: "evident",        p: "adj.", m: "明显的" },
  { w: "exaggerate",     p: "v.",  m: "夸大；夸张" },
  { w: "exceed",         p: "v.",  m: "超过；超出" },
  { w: "exhibit",        p: "v./n.", m: "展现；展览" },
  { w: "expand",         p: "v.",  m: "扩展；扩大" },
  { w: "explicit",       p: "adj.", m: "明确的；清晰的" },
  { w: "facilitate",     p: "v.",  m: "促进；使便利" },
  { w: "fundamental",    p: "adj.", m: "基本的；根本的" },
  { w: "generate",       p: "v.",  m: "产生；生成" },
  { w: "genuine",        p: "adj.", m: "真正的；真诚的" },
  { w: "gradually",      p: "adv.", m: "逐渐地" },
  { w: "implement",      p: "v.",  m: "实施；执行" },
  { w: "implication",    p: "n.",  m: "含义；暗示；影响" },
  { w: "impose",         p: "v.",  m: "强加；征收" },
  { w: "inevitable",     p: "adj.", m: "不可避免的" },
  { w: "inferior",       p: "adj.", m: "较差的；下级的" },
  { w: "influence",      p: "n./v.", m: "影响" },
  { w: "initiative",     p: "n.",  m: "倡议；主动性" },
  { w: "innovative",     p: "adj.", m: "创新的" },
  { w: "insight",        p: "n.",  m: "洞察；见解" },
  { w: "intense",        p: "adj.", m: "强烈的；紧张的" },
  { w: "interpret",      p: "v.",  m: "解释；口译" },
  { w: "justify",        p: "v.",  m: "证明…正当；辩护" },
  { w: "legitimate",     p: "adj.", m: "合法的；正当的" },
  { w: "magnificent",    p: "adj.", m: "壮丽的；极好的" },
  { w: "maintain",       p: "v.",  m: "维持；主张" },
  { w: "manipulate",     p: "v.",  m: "操纵；操作" },
  { w: "moderate",       p: "adj.", m: "适度的；温和的" },
  { w: "modify",         p: "v.",  m: "修改；调整" },
  { w: "notion",         p: "n.",  m: "概念；观念" },
  { w: "notwithstanding",p: "prep.", m: "尽管" },
  { w: "numerous",       p: "adj.", m: "众多的" },
  { w: "objective",      p: "adj./n.", m: "客观的；目标" },
  { w: "obtain",         p: "v.",  m: "获得；得到" },
  { w: "obvious",        p: "adj.", m: "明显的" },
  { w: "participate",    p: "v.",  m: "参加；参与" },
  { w: "perceive",       p: "v.",  m: "察觉；认为" },
  { w: "perspective",    p: "n.",  m: "观点；视角" },
  { w: "phenomenon",     p: "n.",  m: "现象" },
  { w: "predominantly",  p: "adv.", m: "主要地；占主导地位地" },
  { w: "profound",       p: "adj.", m: "深刻的；深远的" },
  { w: "prominent",      p: "adj.", m: "突出的；著名的" },
  { w: "proportion",     p: "n.",  m: "比例；部分" },
  { w: "reluctant",      p: "adj.", m: "不情愿的" },
  { w: "remarkable",     p: "adj.", m: "显著的；非凡的" },
  { w: "require",        p: "v.",  m: "需要；要求" },
  { w: "resemble",       p: "v.",  m: "类似于" },
  { w: "reside",         p: "v.",  m: "居住；存在于" },
  { w: "resolve",        p: "v.",  m: "解决；决心" },
  { w: "restrain",       p: "v.",  m: "抑制；约束" },
  { w: "retain",         p: "v.",  m: "保留；保持" },
  { w: "reveal",         p: "v.",  m: "揭示；显示" },
  { w: "significant",    p: "adj.", m: "重要的；显著的" },
  { w: "simulate",       p: "v.",  m: "模拟；假装" },
  { w: "simultaneously", p: "adv.", m: "同时地" },
  { w: "solely",         p: "adv.", m: "仅仅；唯一地" },
  { w: "sophisticated",  p: "adj.", m: "复杂精密的；老练的" },
  { w: "spontaneous",    p: "adj.", m: "自发的；自然的" },
  { w: "stimulate",      p: "v.",  m: "刺激；激发" },
  { w: "strategy",       p: "n.",  m: "策略；战略" },
  { w: "subsequent",     p: "adj.", m: "随后的；接下来的" },
  { w: "substantial",    p: "adj.", m: "大量的；实质的" },
  { w: "sufficient",     p: "adj.", m: "足够的" },
  { w: "summarize",      p: "v.",  m: "总结；概括" },
  { w: "superior",       p: "adj.", m: "较好的；上级的" },
  { w: "supplement",     p: "v./n.", m: "补充；增补" },
  { w: "sustain",        p: "v.",  m: "维持；支撑" },
  { w: "tackle",         p: "v.",  m: "处理；应对" },
  { w: "tend",           p: "v.",  m: "倾向于；照料" },
  { w: "terminate",      p: "v.",  m: "终止；结束" },
  { w: "thereby",        p: "adv.", m: "从而；因此" },
  { w: "thoroughly",     p: "adv.", m: "彻底地；完全地" },
  { w: "transform",      p: "v.",  m: "转变；改造" },
  { w: "transmit",       p: "v.",  m: "传送；传播" },
  { w: "tremendous",     p: "adj.", m: "巨大的；极好的" },
  { w: "ultimate",       p: "adj.", m: "最终的；根本的" },
  { w: "undergo",        p: "v.",  m: "经历；遭受" },
  { w: "undertake",      p: "v.",  m: "承担；从事" },
  { w: "utilize",        p: "v.",  m: "利用；使用" },
  { w: "valid",          p: "adj.", m: "有效的；有根据的" },
  { w: "vary",           p: "v.",  m: "变化；不同" },
  { w: "vast",           p: "adj.", m: "巨大的；广阔的" },
  { w: "vulnerable",     p: "adj.", m: "脆弱的；易受伤害的" },
  { w: "whereas",        p: "conj.", m: "然而；反之" },
  { w: "widespread",     p: "adj.", m: "广泛的；普遍的" },

  // —— 日记/口语场景中的加分表达 ——
  { w: "accomplish",     p: "v.",  m: "完成；实现" },
  { w: "appreciate",     p: "v.",  m: "感激；欣赏" },
  { w: "cherish",        p: "v.",  m: "珍视；喜爱" },
  { w: "compelling",     p: "adj.", m: "令人信服的；引人入胜的" },
  { w: "contemplate",    p: "v.",  m: "沉思；考虑" },
  { w: "deliberately",   p: "adv.", m: "故意地；审慎地" },
  { w: "exhausted",      p: "adj.", m: "筋疲力尽的" },
  { w: "fulfilling",     p: "adj.", m: "令人满足的" },
  { w: "grateful",       p: "adj.", m: "感激的" },
  { w: "hesitate",       p: "v.",  m: "犹豫" },
  { w: "inspire",        p: "v.",  m: "激励；启发" },
  { w: "meaningful",     p: "adj.", m: "有意义的" },
  { w: "memorable",      p: "adj.", m: "难忘的" },
  { w: "motivate",       p: "v.",  m: "激发动力；激励" },
  { w: "overwhelm",      p: "v.",  m: "使不知所措；压倒" },
  { w: "perseverance",   p: "n.",  m: "毅力；坚持不懈" },
  { w: "productive",     p: "adj.", m: "富有成效的" },
  { w: "procrastinate",  p: "v.",  m: "拖延" },
  { w: "reflect",        p: "v.",  m: "反思；反映" },
  { w: "refreshing",     p: "adj.", m: "令人耳目一新的" },
  { w: "rewarding",      p: "adj.", m: "值得做的；有回报的" },
  { w: "setback",        p: "n.",  m: "挫折；阻碍" },
  { w: "struggle",       p: "v./n.", m: "挣扎；努力" },
  { w: "thrilled",       p: "adj.", m: "非常兴奋的" },
  { w: "tranquil",       p: "adj.", m: "宁静的；安静的" },
  { w: "worthwhile",     p: "adj.", m: "值得的" }
];

/** 连接词 / 衔接手段（Coherence & Cohesion） */
const LINKERS = [
  "however", "moreover", "furthermore", "in addition", "additionally",
  "nevertheless", "nonetheless", "consequently", "therefore", "thus",
  "hence", "as a result", "for instance", "for example", "such as",
  "in contrast", "on the contrary", "on the other hand", "conversely",
  "whereas", "while", "although", "though", "even though", "despite",
  "in spite of", "firstly", "secondly", "finally", "lastly", "overall",
  "in conclusion", "to sum up", "in other words", "namely", "specifically",
  "particularly", "especially", "indeed", "in fact", "as well as",
  "not only", "in order to", "so that", "due to", "owing to",
  "because of", "apart from", "besides", "meanwhile", "afterwards"
];

/** 复杂句式检测（Grammatical Range & Accuracy） */
const COMPLEX_PATTERNS = [
  { name: "让步/原因从句", re: /\b(although|though|even though|while|whereas|because|since|as long as|provided that|unless)\b/gi },
  { name: "定语从句",       re: /\b(which|who|whom|whose|that|where|when)\b/gi },
  { name: "条件句",         re: /\b(if|unless|in case|as long as)\b/gi },
  { name: "被动语态",       re: /\b(am|is|are|was|were|be|been|being|get|got)\s+\w+(ed|en)\b/gi },
  { name: "完成时态",       re: /\b(have|has|had)\s+\w+(ed|en)\b/gi },
  { name: "情态动词",       re: /\b(can|could|may|might|must|should|would|ought to|need to)\b/gi },
  { name: "非谓语/分词结构", re: /\b\w+ing,\s|\b(having|being)\s+\w+(ed|en)\b/gi },
  { name: "名词性从句",     re: /\b(what|whatever|whether|that)\s+\w+\s+(is|was|means|seems)\b/gi },
  { name: "倒装/强调",      re: /\b(not only|only when|hardly|scarcely|never)\s+\w+\s+\w+/gi },
  { name: "比较结构",       re: /\b(more|less|than|rather than|as \w+ as|the most|the least)\b/gi }
];

/** 示例中文日记 */
const SAMPLE_DIARY = `今天早上七点我就起床了，因为要赶去市图书馆准备雅思写作。窗外的空气很清新，梧桐树的叶子已经开始泛黄，让人意识到秋天真的来了。

在图书馆的三个小时里，我完成了一篇关于城市交通的大作文，还整理了二十个学术词汇。虽然中途有点想放弃，但我告诉自己必须坚持下来。下午我和一位英国网友练了半小时口语，他纠正了我几个发音问题，尤其是 "schedule" 和 "either" 的英式读法。

晚上回家的路上，我觉得既疲惫又充实。学习一门语言是一个缓慢的过程，但每一点进步都值得被记录。我相信只要保持规律练习，三个月后我一定能达到目标分数。`;

/** 「中译英」使用的系统提示词 */
const TRANSLATE_SYSTEM_PROMPT = `You are a native English speaker helping a Chinese learner practise spoken diary narration.

Task: translate the user's Chinese diary into natural, colloquial English — narrated ENTIRELY in the SIMPLE PRESENT TENSE, as if the writer is doing each thing right now and describing it live, like a voiceover of their own day.

Rules:
1. Use the SIMPLE PRESENT tense throughout (I get up..., The first thing I do is..., I feel...). Even for things that already happened earlier today, narrate them in the present tense to create a "live commentary" feel.
2. Sound like a real native speaker talking — NOT a textbook. Use contractions (I'm, don't, it's, gonna, wanna when the mood is casual), common phrasal verbs (get up, check my phone, head out, grab a coffee, chill out, squeeze in), and high-frequency spoken expressions native speakers genuinely use every day.
3. Use natural spoken connectors and fillers the way natives actually talk: so, then, but, anyway, turns out, luckily, honestly, plus, by the time..., before I know it... Avoid stiff written transitions like "furthermore", "therefore", "in addition".
4. Mix sentence lengths for rhythm — a few short punchy sentences between longer ones. Never write one endless run-on.
5. Keep the first-person, personal-diary voice. Warm, casual, authentic.
6. Convey the meaning and feeling, not the literal words. Restructure sentences freely so they flow the way English naturally flows. Localize Chinese-specific things in a way a native would say them (e.g. 共享单车 → a shared bike, 宿舍 → my dorm, 扫码 → scan the QR code).
7. Preserve the paragraph breaks of the source text EXACTLY — output the same number of paragraphs in the same order, separated by blank lines (this is required for bilingual display). Never merge or split paragraphs.
8. Output ONLY the English text. No explanations, no notes, no Chinese characters.

Example of the style wanted:
  中文: 我大约早上十点半起床。醒来后，我先拿起手机看看有没有消息，然后刷牙、洗脸。
  English: I get up at around 10:30 in the morning. The first thing I do is check my phone to see if I have any messages. Then I brush my teeth and wash my face.`;
