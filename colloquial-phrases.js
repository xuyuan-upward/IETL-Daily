/* ============================================================
   老外高频口语词典
   ---------------------------------------------------------------
   用途：翻译完成后，自动扫描英文日记，找出里面用到的「native
   真正高频使用的口语表达」，并生成「今日高频口语总结」。

   数据结构：
   - COLLOQUIAL_PHRASES: 多词短语 / 惯用语 / 口头禅（优先匹配）
       { p: "短语（小写）", m: "中文释义", cat: "类别" }
   - COLLOQUIAL_WORDS:  单个词的口语用法（词边界精确匹配）
       { w: "单词", m: "中文释义", cat: "类别" }

   匹配规则：
   - 短语用 \b...\b 边界匹配，不区分大小写
   - 短语内的动词形态会自动兼容（如 end up / ended up / ending up
     通过把短语写成 "end up" 再由正则处理常见屈折）——为简单可靠，
     词典里直接收录常见形态变体（ended up / end up 各收一条）。
   ============================================================ */

const COLLOQUIAL_PHRASES = [
  /* ---------- 动词短语 / 固定搭配（最高频） ---------- */
  { p: "ended up", m: "最后竟然…；不知不觉就…", cat: "高频动词短语" },
  { p: "end up", m: "最后竟然…；不知不觉就…", cat: "高频动词短语" },
  { p: "figured out", m: "想明白；搞懂；解决", cat: "高频动词短语" },
  { p: "figure out", m: "想明白；搞懂；解决", cat: "高频动词短语" },
  { p: "hung out", m: "闲逛；一起玩", cat: "高频动词短语" },
  { p: "hang out", m: "闲逛；一起玩", cat: "高频动词短语" },
  { p: "chill out", m: "放松；冷静", cat: "高频动词短语" },
  { p: "sorted out", m: "搞定；整理好", cat: "高频动词短语" },
  { p: "sort out", m: "搞定；整理好", cat: "高频动词短语" },
  { p: "work out", m: "锻炼；解决；结果是", cat: "高频动词短语" },
  { p: "picked up", m: "顺路买/接；学会；取", cat: "高频动词短语" },
  { p: "pick up", m: "顺路买/接；学会；取", cat: "高频动词短语" },
  { p: "pop in", m: "顺路进来一下", cat: "高频动词短语" },
  { p: "pop into", m: "顺路进（店）", cat: "高频动词短语" },
  { p: "pop out", m: "出去一下", cat: "高频动词短语" },
  { p: "pop round", m: "顺路来家里（英式）", cat: "高频动词短语" },
  { p: "popped into", m: "顺路进（店）", cat: "高频动词短语" },
  { p: "nipped into", m: "快速闪进（店）", cat: "高频动词短语" },
  { p: "nip into", m: "快速闪进（店）", cat: "高频动词短语" },
  { p: "dropped by", m: "顺路拜访", cat: "高频动词短语" },
  { p: "drop by", m: "顺路拜访", cat: "高频动词短语" },
  { p: "bumped into", m: "偶遇；撞见", cat: "高频动词短语" },
  { p: "bump into", m: "偶遇；撞见", cat: "高频动词短语" },
  { p: "ran into", m: "偶遇", cat: "高频动词短语" },
  { p: "run out of", m: "用完了；耗尽", cat: "高频动词短语" },
  { p: "ran out of", m: "用完了；耗尽", cat: "高频动词短语" },
  { p: "put off", m: "拖延；推迟", cat: "高频动词短语" },
  { p: "get on with", m: "继续做；与…相处（英式）", cat: "高频动词短语" },
  { p: "get along", m: "相处融洽", cat: "高频动词短语" },
  { p: "look forward to", m: "期待", cat: "高频动词短语" },
  { p: "looking forward to", m: "期待", cat: "高频动词短语" },
  { p: "can't wait", m: "迫不及待", cat: "高频动词短语" },
  { p: "cannot wait", m: "迫不及待", cat: "高频动词短语" },
  { p: "get stuck into", m: "埋头投入做", cat: "高频动词短语" },
  { p: "crack on", m: "抓紧干（英式）", cat: "高频动词短语" },
  { p: "crack on with", m: "抓紧做（英式）", cat: "高频动词短语" },
  { p: "carry on", m: "继续", cat: "高频动词短语" },
  { p: "stick with", m: "坚持", cat: "高频动词短语" },
  { p: "keep at it", m: "坚持住；别停", cat: "高频动词短语" },
  { p: "keep it up", m: "继续保持", cat: "高频动词短语" },
  { p: "hang in there", m: "挺住", cat: "高频动词短语" },
  { p: "get through", m: "熬过去；完成", cat: "高频动词短语" },
  { p: "got through", m: "熬过去；完成", cat: "高频动词短语" },
  { p: "deal with", m: "处理；应对", cat: "高频动词短语" },
  { p: "cope with", m: "应付", cat: "高频动词短语" },
  { p: "get by", m: "勉强应付；凑合过", cat: "高频动词短语" },
  { p: "catch up", m: "补进度；聚一聚聊近况", cat: "高频动词短语" },
  { p: "caught up", m: "补进度；聚一聚聊近况", cat: "高频动词短语" },
  { p: "catch up on", m: "补上（落下的）", cat: "高频动词短语" },
  { p: "meet up", m: "碰头；约见面", cat: "高频动词短语" },
  { p: "met up", m: "碰头；约见面", cat: "高频动词短语" },
  { p: "link up", m: "约一起；汇合", cat: "高频动词短语" },
  { p: "keep in touch", m: "保持联系", cat: "高频动词短语" },
  { p: "stay in touch", m: "保持联系", cat: "高频动词短语" },
  { p: "let me know", m: "告诉我一声", cat: "高频动词短语" },
  { p: "keep me posted", m: "随时告诉我进展", cat: "高频动词短语" },
  { p: "wind down", m: "放松下来", cat: "高频动词短语" },
  { p: "unwind", m: "放松", cat: "高频动词短语" },
  { p: "calm down", m: "冷静", cat: "高频动词短语" },
  { p: "freak out", m: "崩溃；抓狂", cat: "高频动词短语" },
  { p: "freaked out", m: "崩溃；抓狂", cat: "高频动词短语" },
  { p: "get over it", m: "放下；走出来", cat: "高频动词短语" },
  { p: "bounce back", m: "振作；恢复", cat: "高频动词短语" },
  { p: "treat myself", m: "犒劳自己", cat: "高频动词短语" },
  { p: "grab a coffee", m: "买杯咖啡", cat: "高频动词短语" },
  { p: "grab a bite", m: "随便吃点", cat: "高频动词短语" },
  { p: "grab some", m: "顺路买点…", cat: "高频动词短语" },
  { p: "whip up", m: "快速做出（一餐）", cat: "高频动词短语" },
  { p: "whipped up", m: "快速做出（一餐）", cat: "高频动词短语" },
  { p: "order in", m: "点外卖", cat: "高频动词短语" },
  { p: "eat out", m: "出去吃", cat: "高频动词短语" },
  { p: "head to", m: "前往（口语代替 go to）", cat: "高频动词短语" },
  { p: "headed to", m: "前往（口语代替 went to）", cat: "高频动词短语" },
  { p: "head back", m: "回去", cat: "高频动词短语" },
  { p: "headed back", m: "回去了", cat: "高频动词短语" },
  { p: "head off", m: "出发；离开", cat: "高频动词短语" },
  { p: "turn up", m: "出现；到场", cat: "高频动词短语" },
  { p: "turned up", m: "出现；到场", cat: "高频动词短语" },
  { p: "turned out", m: "结果是…；原来是…", cat: "高频动词短语" },
  { p: "turns out", m: "结果是…；原来是…", cat: "高频动词短语" },
  { p: "come up with", m: "想出（主意）", cat: "高频动词短语" },
  { p: "came up with", m: "想出（主意）", cat: "高频动词短语" },
  { p: "give it a go", m: "试一试（英式）", cat: "高频动词短语" },
  { p: "give it a shot", m: "试一试", cat: "高频动词短语" },
  { p: "give it a try", m: "试一试", cat: "高频动词短语" },
  { p: "go for it", m: "放手去做", cat: "高频动词短语" },
  { p: "went for", m: "选了（某菜/某项）", cat: "高频动词短语" },
  { p: "go for", m: "选（某菜/某项）", cat: "高频动词短语" },
  { p: "fancy a", m: "想来一个…吗（英式）", cat: "高频动词短语" },
  { p: "fancy doing", m: "想做…（英式）", cat: "高频动词短语" },
  { p: "feel like", m: "想要…；感觉像…", cat: "高频动词短语" },
  { p: "felt like", m: "想要…；感觉像…", cat: "高频动词短语" },

  /* ---------- 口头禅 / 会话标记（最能体现 native 味道） ---------- */
  { p: "to be honest", m: "老实说", cat: "口头禅" },
  { p: "to be fair", m: "说句公道话", cat: "口头禅" },
  { p: "honestly", m: "说真的", cat: "口头禅" },
  { p: "I mean", m: "我的意思是；怎么说呢", cat: "口头禅" },
  { p: "you know", m: "你知道吧；你懂的", cat: "口头禅" },
  { p: "kind of", m: "有点儿", cat: "口头禅" },
  { p: "kinda", m: "有点儿", cat: "口头禅" },
  { p: "sort of", m: "有点；算是", cat: "口头禅" },
  { p: "sorta", m: "有点；算是", cat: "口头禅" },
  { p: "I guess", m: "我想…吧", cat: "口头禅" },
  { p: "I reckon", m: "我觉得（英式）", cat: "口头禅" },
  { p: "I suppose", m: "我觉得（英式委婉）", cat: "口头禅" },
  { p: "basically", m: "说白了；基本上", cat: "口头禅" },
  { p: "literally", m: "简直；真的是", cat: "口头禅" },
  { p: "actually", m: "其实；事实上", cat: "口头禅" },
  { p: "apparently", m: "据说；看来", cat: "口头禅" },
  { p: "obviously", m: "显然", cat: "口头禅" },
  { p: "anyway", m: "总之；反正", cat: "口头禅" },
  { p: "anyways", m: "总之；反正", cat: "口头禅" },
  { p: "at least", m: "至少", cat: "口头禅" },
  { p: "in the end", m: "最后", cat: "口头禅" },
  { p: "at the end of the day", m: "说到底", cat: "口头禅" },
  { p: "all in all", m: "总的来说", cat: "口头禅" },
  { p: "long story short", m: "长话短说", cat: "口头禅" },
  { p: "in a nutshell", m: "简而言之", cat: "口头禅" },
  { p: "come to think of it", m: "这么一想", cat: "口头禅" },
  { p: "speaking of which", m: "说到这个", cat: "口头禅" },
  { p: "that reminds me", m: "这倒提醒我了", cat: "口头禅" },
  { p: "on that note", m: "说到这", cat: "口头禅" },
  { p: "fair enough", m: "有道理；也行", cat: "口头禅" },
  { p: "makes sense", m: "有道理；说得通", cat: "口头禅" },
  { p: "no worries", m: "没事儿；别担心", cat: "口头禅" },
  { p: "no big deal", m: "没什么大不了", cat: "口头禅" },
  { p: "no biggie", m: "小事一桩", cat: "口头禅" },
  { p: "sounds good", m: "听起来不错", cat: "口头禅" },
  { p: "good call", m: "好主意；决定得好", cat: "口头禅" },
  { p: "nice one", m: "干得漂亮（英式）", cat: "口头禅" },
  { p: "fair play", m: "佩服；公道地说", cat: "口头禅" },
  { p: "good for you", m: "为你高兴；真行", cat: "口头禅" },
  { p: "might as well", m: "不如就…；干脆", cat: "口头禅" },
  { p: "why not", m: "为什么不呢", cat: "口头禅" },
  { p: "go ahead", m: "来吧；请便", cat: "口头禅" },
  { p: "help yourself", m: "随便吃/用", cat: "口头禅" },
  { p: "take your time", m: "慢慢来", cat: "口头禅" },
  { p: "no rush", m: "不急", cat: "口头禅" },
  { p: "hang on", m: "等一下", cat: "口头禅" },
  { p: "hold on", m: "等一下", cat: "口头禅" },
  { p: "bear with me", m: "稍等我一下", cat: "口头禅" },
  { p: "just a sec", m: "稍等", cat: "口头禅" },
  { p: "in a bit", m: "待会儿", cat: "口头禅" },
  { p: "see you in a bit", m: "待会儿见", cat: "口头禅" },
  { p: "catch you later", m: "回头见", cat: "口头禅" },
  { p: "there you go", m: "好了；就这样", cat: "口头禅" },
  { p: "here we go", m: "来了；开始了", cat: "口头禅" },
  { p: "off we go", m: "出发咯", cat: "口头禅" },
  { p: "lo and behold", m: "你猜怎么着（神奇）", cat: "口头禅" },

  /* ---------- 程度强化（英式特色 intensifier） ---------- */
  { p: "absolutely", m: "绝对；超级（强化语气）", cat: "程度强化" },
  { p: "totally", m: "完全；太…了", cat: "程度强化" },
  { p: "completely", m: "完全", cat: "程度强化" },
  { p: "incredibly", m: "难以置信地", cat: "程度强化" },
  { p: "ridiculously", m: "离谱地；超级", cat: "程度强化" },
  { p: "insanely", m: "疯狂程度地", cat: "程度强化" },
  { p: "seriously", m: "非常；认真地", cat: "程度强化" },
  { p: "proper", m: "十足的；真正的（英式强化）", cat: "程度强化" },
  { p: "properly", m: "真正地；好好地（英式强化）", cat: "程度强化" },
  { p: "dead", m: "非常；完全（英式强化）", cat: "程度强化" },
  { p: "well", m: "非常；相当（英式强化，如 well good）", cat: "程度强化" },
  { p: "pretty much", m: "基本上；差不多", cat: "程度强化" },
  { p: "more or less", m: "差不多", cat: "程度强化" },
  { p: "quite a bit", m: "不少", cat: "程度强化" },
  { p: "a bit of a", m: "有点…（弱化语气）", cat: "程度强化" },
  { p: "a bit", m: "有点儿", cat: "程度强化" },
  { p: "a couple of", m: "两三个", cat: "程度强化" },
  { p: "a load of", m: "一大堆", cat: "程度强化" },
  { p: "loads of", m: "一大堆（英式）", cat: "程度强化" },
  { p: "tons of", m: "一大堆", cat: "程度强化" },
  { p: "heaps of", m: "一大堆（英式/澳式）", cat: "程度强化" },
  { p: "a bunch of", m: "一群；一堆", cat: "程度强化" },
  { p: "a solid", m: "整整（时间，如 a solid 3 hours）", cat: "程度强化" },
  { p: "for ages", m: "好长时间", cat: "程度强化" },
  { p: "way better", m: "好太多", cat: "程度强化" },
  { p: "way more", m: "多太多", cat: "程度强化" },
  { p: "so much better", m: "好太多", cat: "程度强化" },
  { p: "by far", m: "目前为止最…", cat: "程度强化" },
  { p: "hands down", m: "毫无疑问", cat: "程度强化" },

  /* ---------- 评价 / 感叹（情绪表达） ---------- */
  { p: "over the moon", m: "欣喜若狂（英式）", cat: "评价感叹" },
  { p: "chuffed to bits", m: "开心坏了（英式）", cat: "评价感叹" },
  { p: "well worth it", m: "非常值得", cat: "评价感叹" },
  { p: "absolutely worth it", m: "绝对值得", cat: "评价感叹" },
  { p: "not bad", m: "还不错", cat: "评价感叹" },
  { p: "not bad at all", m: "相当不错", cat: "评价感叹" },
  { p: "not too shabby", m: "挺不错（自夸/夸人）", cat: "评价感叹" },
  { p: "piece of cake", m: "小菜一碟", cat: "评价感叹" },
  { p: "dead easy", m: "超简单（英式）", cat: "评价感叹" },
  { p: "a nightmare", m: "一场噩梦；太折磨", cat: "评价感叹" },
  { p: "a pain", m: "真麻烦", cat: "评价感叹" },
  { p: "what a pain", m: "真烦人", cat: "评价感叹" },
  { p: "no way", m: "不可能；不会吧", cat: "评价感叹" },
  { p: "you're joking", m: "你开玩笑吧", cat: "评价感叹" },
  { p: "you must be joking", m: "你在逗我吧", cat: "评价感叹" },
  { p: "blew my mind", m: "震撼到我了", cat: "评价感叹" },
  { p: "blew me away", m: "惊艳到我了", cat: "评价感叹" },
  { p: "out of this world", m: "绝了；无敌好吃", cat: "评价感叹" },
  { p: "on the house", m: "店家免费送的", cat: "评价感叹" },
  { p: "spot on", m: "完全正确；恰到好处（英式）", cat: "评价感叹" },
  { p: "bang on", m: "完全正确（英式）", cat: "评价感叹" },
  { p: "well good", m: "超好（英式俚语）", cat: "评价感叹" },
  { p: "love-hate", m: "又爱又恨", cat: "评价感叹" },
  { p: "it is what it is", m: "就这样吧；接受现实", cat: "评价感叹" },
  { p: "so far so good", m: "目前为止一切顺利", cat: "评价感叹" },
  { p: "better late than never", m: "迟到总比不来好", cat: "评价感叹" },
  { p: "every little helps", m: "积少成多（英式谚语）", cat: "评价感叹" },
  { p: "fingers crossed", m: "祈祷好运", cat: "评价感叹" },
  { p: "touch wood", m: "摸摸木头求好运（英式）", cat: "评价感叹" },
  { p: "break a leg", m: "祝好运（演出前）", cat: "评价感叹" },
  { p: "good luck with", m: "祝…好运", cat: "评价感叹" },
  { p: "make the most of", m: "充分利用", cat: "评价感叹" },
  { p: "made the most of", m: "充分利用了", cat: "评价感叹" },
  { p: "worth every penny", m: "每一分钱都值", cat: "评价感叹" },

  /* ---------- 状态 / 情绪 ---------- */
  { p: "fed up", m: "受够了", cat: "状态情绪" },
  { p: "sick of", m: "厌烦…", cat: "状态情绪" },
  { p: "tired of", m: "厌倦…", cat: "状态情绪" },
  { p: "bored of", m: "对…感到无聊", cat: "状态情绪" },
  { p: "had enough", m: "受够了", cat: "状态情绪" },
  { p: "be into", m: "迷上；喜欢", cat: "状态情绪" },
  { p: "keen on", m: "热衷（英式）", cat: "状态情绪" },
  { p: "mad about", m: "痴迷于（英式）", cat: "状态情绪" },
  { p: "crazy about", m: "痴迷于", cat: "状态情绪" },
  { p: "not my cup of tea", m: "不是我的菜（英式）", cat: "状态情绪" },
  { p: "not my thing", m: "不是我的菜", cat: "状态情绪" },
  { p: "in the mood", m: "有心情", cat: "状态情绪" },
  { p: "not in the mood", m: "没心情", cat: "状态情绪" },
  { p: "on my mind", m: "惦记着", cat: "状态情绪" },
  { p: "off my chest", m: "说出来（一吐为快）", cat: "状态情绪" },
  { p: "on the go", m: "忙个不停", cat: "状态情绪" },
  { p: "on my way", m: "在路上了", cat: "状态情绪" },
  { p: "in the loop", m: "知情；在圈子里", cat: "状态情绪" },
  { p: "on the same page", m: "想法一致", cat: "状态情绪" },
  { p: "under the weather", m: "身体不舒服", cat: "状态情绪" },
  { p: "out like a light", m: "秒睡", cat: "状态情绪" },
  { p: "couldn't be bothered", m: "懒得（英式）", cat: "状态情绪" },
  { p: "can't be bothered", m: "懒得（英式）", cat: "状态情绪" },
  { p: "don't fancy", m: "不想（英式）", cat: "状态情绪" },
  { p: "didn't fancy", m: "不想（英式）", cat: "状态情绪" },

  /* ---------- 日常高频句块（日记里最常见的叙事搭配） ---------- */
  { p: "get up", m: "起床", cat: "日常句块" },
  { p: "wake up", m: "醒来", cat: "日常句块" },
  { p: "at around", m: "大约在…（点时间）", cat: "日常句块" },
  { p: "in the morning", m: "早上/上午", cat: "日常句块" },
  { p: "check my phone", m: "看手机（消息）", cat: "日常句块" },
  { p: "check the", m: "查看一下…", cat: "日常句块" },
  { p: "see if", m: "看看有没有/是否…", cat: "日常句块" },
  { p: "have a shower", m: "洗个澡（英式）", cat: "日常句块" },
  { p: "take a shower", m: "洗个澡", cat: "日常句块" },
  { p: "brush my teeth", m: "刷牙", cat: "日常句块" },
  { p: "pack up", m: "收拾好（东西）", cat: "日常句块" },
  { p: "head out", m: "出门", cat: "日常句块" },
  { p: "head out to", m: "出门去…", cat: "日常句块" },
  { p: "turn on", m: "打开（电器/功能）", cat: "日常句块" },
  { p: "turn off", m: "关掉", cat: "日常句块" },
  { p: "as soon as", m: "一…就…", cat: "日常句块" },
  { p: "get home", m: "到家", cat: "日常句块" },
  { p: "get back", m: "回来；回到", cat: "日常句块" },
  { p: "on the way", m: "在路上；顺路", cat: "日常句块" },
  { p: "on the way home", m: "在回家的路上", cat: "日常句块" },
  { p: "on my way", m: "在路上", cat: "日常句块" },
  { p: "get enough sleep", m: "睡够", cat: "日常句块" },
  { p: "barely", m: "几乎没…", cat: "日常句块" },
  { p: "feel exhausted", m: "感觉累坏了", cat: "日常句块" },
  { p: "get a little", m: "有点…（情绪变化）", cat: "日常句块" },
  { p: "think about", m: "想起；思考", cat: "日常句块" },
  { p: "put together", m: "整理出；拼出；做出", cat: "日常句块" },
  { p: "end up at", m: "最后到了…", cat: "日常句块" },
  { p: "take a break", m: "休息一下", cat: "日常句块" },
  { p: "have a nap", m: "小睡一会儿", cat: "日常句块" },
  { p: "catch the bus", m: "赶上公交", cat: "日常句块" },
  { p: "miss the", m: "没赶上/错过…", cat: "日常句块" },
  { p: "get to work", m: "开始干活；到岗", cat: "日常句块" },
  { p: "leave home", m: "离开家", cat: "日常句块" },
  { p: "go for a walk", m: "出去散步", cat: "日常句块" },
  { p: "go for a run", m: "去跑步", cat: "日常句块" },
  { p: "tidy up", m: "收拾；整理（英式）", cat: "日常句块" },
  { p: "do the dishes", m: "洗碗", cat: "日常句块" },
  { p: "do some washing", m: "洗衣服（英式）", cat: "日常句块" },
  { p: "have a chat", m: "聊一聊（英式）", cat: "日常句块" },
  { p: "get ready", m: "准备好；收拾妥当", cat: "日常句块" },
  { p: "in a hurry", m: "赶时间", cat: "日常句块" },
  { p: "take ages", m: "花好久（英式）", cat: "日常句块" },
  { p: "right now", m: "现在；此刻", cat: "日常句块" },
  { p: "for a bit", m: "一会儿（英式）", cat: "日常句块" },
  { p: "run some errands", m: "出去办点事", cat: "日常句块" },
  { p: "pop to the", m: "顺路去一下…（英式）", cat: "日常句块" },
  { p: "drop off", m: "顺便放下；睡着；送（某人）到", cat: "日常句块" },
  { p: "have breakfast", m: "吃早饭", cat: "日常句块" },
  { p: "have lunch", m: "吃午饭", cat: "日常句块" },
  { p: "have dinner", m: "吃晚饭", cat: "日常句块" },
  { p: "make some", m: "做点…（吃的/喝的）", cat: "日常句块" },
  { p: "a bit of", m: "一点儿…", cat: "日常句块" },
  { p: "spend time", m: "花时间", cat: "日常句块" },
  { p: "the rest of", m: "剩下的…", cat: "日常句块" },
  { p: "used to", m: "以前常常…", cat: "日常句块" },
  { p: "remind me of", m: "让我想起…", cat: "日常句块" }
];

/* 单个词的口语用法（词边界精确匹配，全部小写存储） */
const COLLOQUIAL_WORDS = [
  { w: "knackered", m: "累瘫了（英式）", cat: "口语词汇" },
  { w: "shattered", m: "累散架了（英式）", cat: "口语词汇" },
  { w: "chuffed", m: "美滋滋；得意（英式）", cat: "口语词汇" },
  { w: "gutted", m: "大失所望（英式）", cat: "口语词汇" },
  { w: "buzzing", m: "兴奋激动（英式）", cat: "口语词汇" },
  { w: "thrilled", m: "非常兴奋", cat: "口语词汇" },
  { w: "stoked", m: "超兴奋（美式/澳式）", cat: "口语词汇" },
  { w: "exhausted", m: "精疲力尽", cat: "口语词汇" },
  { w: "drained", m: "被掏空；累", cat: "口语词汇" },
  { w: "starving", m: "饿死了", cat: "口语词汇" },
  { w: "famished", m: "饿扁了（英式）", cat: "口语词汇" },
  { w: "peckish", m: "有点饿（英式）", cat: "口语词汇" },
  { w: "stuffed", m: "吃撑了", cat: "口语词汇" },
  { w: "skint", m: "手头紧（英式）", cat: "口语词汇" },
  { w: "mate", m: "哥们（英式）", cat: "口语词汇" },
  { w: "mates", m: "朋友们（英式）", cat: "口语词汇" },
  { w: "bloke", m: "小伙子；男人（英式）", cat: "口语词汇" },
  { w: "chap", m: "小伙子（英式）", cat: "口语词汇" },
  { w: "lad", m: "小伙子（英式）", cat: "口语词汇" },
  { w: "lads", m: "哥几个（英式）", cat: "口语词汇" },
  { w: "cheers", m: "谢谢；再见；干杯（英式万能词）", cat: "口语词汇" },
  { w: "ta", m: "谢谢（英式口语）", cat: "口语词汇" },
  { w: "lovely", m: "太好了；可爱的（英式高频）", cat: "口语词汇" },
  { w: "brilliant", m: "太棒了（英式最高频赞美）", cat: "口语词汇" },
  { w: "brill", m: "太棒了（brilliant 的缩写）", cat: "口语词汇" },
  { w: "gorgeous", m: "绝美；超棒", cat: "口语词汇" },
  { w: "smashing", m: "极好的（英式老派）", cat: "口语词汇" },
  { w: "lush", m: "极好；美味（英式）", cat: "口语词汇" },
  { w: "ace", m: "超棒（英式）", cat: "口语词汇" },
  { w: "mint", m: "超赞（英式俚语）", cat: "口语词汇" },
  { w: "wicked", m: "超酷", cat: "口语词汇" },
  { w: "sick", m: "太牛了（俚语）", cat: "口语词汇" },
  { w: "mental", m: "疯狂；离谱（英式）", cat: "口语词汇" },
  { w: "mad", m: "疯狂（英式高频）", cat: "口语词汇" },
  { w: "bonkers", m: "疯疯癫癫（英式）", cat: "口语词汇" },
  { w: "dodgy", m: "可疑；不靠谱（英式）", cat: "口语词汇" },
  { w: "daft", m: "傻乎乎（英式）", cat: "口语词汇" },
  { w: "naff", m: "土气（英式）", cat: "口语词汇" },
  { w: "posh", m: "高档；讲究（英式）", cat: "口语词汇" },
  { w: "cosy", m: "温馨舒适（英式拼写）", cat: "口语词汇" },
  { w: "hectic", m: "忙乱的", cat: "口语词汇" },
  { w: "manic", m: "忙到发疯（英式）", cat: "口语词汇" },
  { w: "swamped", m: "忙不过来", cat: "口语词汇" },
  { w: "quid", m: "英镑（英式，= pounds）", cat: "口语词汇" },
  { w: "tenner", m: "十英镑（英式）", cat: "口语词汇" },
  { w: "fiver", m: "五英镑（英式）", cat: "口语词汇" },
  { w: "cuppa", m: "一杯茶（英式）", cat: "口语词汇" },
  { w: "brew", m: "一杯热饮（英式）", cat: "口语词汇" },
  { w: "brolly", m: "雨伞（英式）", cat: "口语词汇" },
  { w: "telly", m: "电视（英式）", cat: "口语词汇" },
  { w: "telly", m: "电视（英式）", cat: "口语词汇" },
  { w: "chippy", m: "炸鱼薯条店（英式）", cat: "口语词汇" },
  { w: "biscuit", m: "饼干（英式）", cat: "口语词汇" },
  { w: "crisps", m: "薯片（英式）", cat: "口语词汇" },
  { w: "chips", m: "薯条（英式）", cat: "口语词汇" },
  { w: "takeaway", m: "外卖（英式）", cat: "口语词汇" },
  { w: "flat", m: "公寓（英式）", cat: "口语词汇" },
  { w: "lift", m: "电梯（英式）", cat: "口语词汇" },
  { w: "lorry", m: "卡车（英式）", cat: "口语词汇" },
  { w: "boot", m: "汽车后备箱（英式）", cat: "口语词汇" },
  { w: "bonnet", m: "汽车引擎盖（英式）", cat: "口语词汇" },
  { w: "chemist", m: "药店（英式）", cat: "口语词汇" },
  { w: "GP", m: "家庭医生（英式）", cat: "口语词汇" },
  { w: "uni", m: "大学（英式）", cat: "口语词汇" },
  { w: "hols", m: "假期（英式口语）", cat: "口语词汇" },
  { w: "fortnight", m: "两周（英式）", cat: "口语词汇" },
  { w: "loo", m: "厕所（英式）", cat: "口语词汇" },
  { w: "rubbish", m: "垃圾；胡说（英式）", cat: "口语词汇" },
  { w: "bin", m: "垃圾桶（英式）", cat: "口语词汇" },
  { w: "trousers", m: "长裤（英式）", cat: "口语词汇" },
  { w: "jumper", m: "毛衣（英式）", cat: "口语词汇" },
  { w: "trainers", m: "运动鞋（英式）", cat: "口语词汇" },
  { w: "wellies", m: "雨靴（英式）", cat: "口语词汇" },
  { w: "nappies", m: "尿布（英式）", cat: "口语词汇" },
  { w: "pram", m: "婴儿车（英式）", cat: "口语词汇" },
  { w: "queue", m: "排队（英式）", cat: "口语词汇" },
  { w: "petrol", m: "汽油（英式）", cat: "口语词汇" },
  { w: "motorway", m: "高速公路（英式）", cat: "口语词汇" },
  { w: "pavement", m: "人行道（英式）", cat: "口语词汇" },
  { w: "zebra crossing", m: "斑马线（英式）", cat: "口语词汇" },
  { w: "postcode", m: "邮编（英式）", cat: "口语词汇" },
  { w: "car park", m: "停车场（英式）", cat: "口语词汇" },
  { w: "sarnie", m: "三明治（英式口语）", cat: "口语词汇" },
  { w: "brekkie", m: "早餐（口语）", cat: "口语词汇" },
  { w: "dinner", m: "正餐（英式常指午餐/晚餐）", cat: "口语词汇" },
  { w: "pudding", m: "甜点（英式）", cat: "口语词汇" },
  { w: "afters", m: "饭后甜点（英式口语）", cat: "口语词汇" },
  { w: "nicked", m: "被偷（英式口语）", cat: "口语词汇" },
  { w: "gobsmacked", m: "惊得目瞪口呆（英式）", cat: "口语词汇" },
  { w: "faff", m: "瞎忙活（英式）", cat: "口语词汇" },
  { w: "sorted", m: "搞定了（英式万能词）", cat: "口语词汇" },
  { w: "gutted", m: "大失所望（英式）", cat: "口语词汇" },
  { w: "gobsmacked", m: "目瞪口呆（英式）", cat: "口语词汇" },
  { w: "chunder", m: "呕吐（英式俚语）", cat: "口语词汇" }
];

/* 去重（词典里手工收录难免重复，初始化时按 key 去重） */
(function dedupe() {
  const seenP = new Set();
  for (let i = COLLOQUIAL_PHRASES.length - 1; i >= 0; i--) {
    const k = COLLOQUIAL_PHRASES[i].p;
    if (seenP.has(k)) COLLOQUIAL_PHRASES.splice(i, 1);
    else seenP.add(k);
  }
  const seenW = new Set();
  for (let i = COLLOQUIAL_WORDS.length - 1; i >= 0; i--) {
    const k = COLLOQUIAL_WORDS[i].w;
    if (seenW.has(k)) COLLOQUIAL_WORDS.splice(i, 1);
    else seenW.add(k);
  }
})();

/* ---------- 动词变形兼容：不规则动词表 ---------- */
const IRREGULAR_VERBS = {
  be: ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being', "'m", "'s", "'re", '’m', '’s', '’re'],
  have: ['have', 'has', 'had', 'having'],
  do: ['do', 'does', 'did', 'done', 'doing'],
  go: ['go', 'goes', 'went', 'gone', 'going'],
  get: ['get', 'gets', 'got', 'getting'],
  come: ['come', 'comes', 'came', 'coming'],
  take: ['take', 'takes', 'took', 'taken', 'taking'],
  make: ['make', 'makes', 'made', 'making'],
  run: ['run', 'runs', 'ran', 'running'],
  hang: ['hang', 'hangs', 'hung', 'hanging'],
  fall: ['fall', 'falls', 'fell', 'fallen', 'falling'],
  feel: ['feel', 'feels', 'felt', 'feeling'],
  find: ['find', 'finds', 'found', 'finding'],
  give: ['give', 'gives', 'gave', 'given', 'giving'],
  know: ['know', 'knows', 'knew', 'known', 'knowing'],
  put: ['put', 'puts', 'putting'],
  say: ['say', 'says', 'said', 'saying'],
  see: ['see', 'sees', 'saw', 'seen', 'seeing'],
  sit: ['sit', 'sits', 'sat', 'sitting'],
  spend: ['spend', 'spends', 'spent', 'spending'],
  stand: ['stand', 'stands', 'stood', 'standing'],
  stick: ['stick', 'sticks', 'stuck', 'sticking'],
  tell: ['tell', 'tells', 'told', 'telling'],
  think: ['think', 'thinks', 'thought', 'thinking'],
  cut: ['cut', 'cuts', 'cutting'],
  shut: ['shut', 'shuts', 'shutting'],
  hit: ['hit', 'hits', 'hitting'],
  grow: ['grow', 'grows', 'grew', 'grown', 'growing'],
  wear: ['wear', 'wears', 'wore', 'worn', 'wearing'],
  wake: ['wake', 'wakes', 'woke', 'woken', 'waking'],
  can: ['can', 'could'],
  will: ['will', 'would'],
  mean: ['mean', 'means', 'meant', 'meaning']
};

/* 不作变形的小词 / 小品词（精确匹配即可） */
const COLLO_PARTICLES = new Set([
  'up', 'out', 'off', 'on', 'in', 'into', 'over', 'by', 'down', 'away', 'back',
  'round', 'around', 'through', 'to', 'of', 'a', 'an', 'the', 'it', 'its',
  'my', 'your', 'his', 'her', 'our', 'their', 'me', 'you', 'him', 'us', 'them',
  'this', 'that', 'these', 'those', 'not', 'no', 'so', 'as', 'at', 'for',
  'with', 'about', 'and', 'or', 'but', 'if', 'than', 'then', 'there', 'here',
  'all', 'just', 'really', 'very', 'too', 'again', 'pretty', 'quite', 'much',
  'i', 'we', 'he', 'she', 'they', 'what', 'how', 'when', 'who', 'why'
]);

function _escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 为一个单词生成「变形兼容」的正则片段：
 * - 不规则动词 → 全形态任选
 * - 规则动词/名词 → 兼容 -s/-es/-ed/-ing（含去 e、y→i、双写尾字母）
 * - 小品词 / 短词 → 精确匹配
 */
function _flexWordRe(w) {
  const lw = w.toLowerCase();
  if (IRREGULAR_VERBS[lw]) return '(?:' + IRREGULAR_VERBS[lw].map(_escapeRe).join('|') + ')';
  if (COLLO_PARTICLES.has(lw) || lw.length <= 2 || !/^[a-z]+$/.test(lw)) return _escapeRe(w);

  const forms = new Set([lw, lw + 's', lw + 'es', lw + 'ed', lw + 'd', lw + 'ing']);
  if (lw.endsWith('e')) {
    const stem = lw.slice(0, -1);
    forms.add(stem + 'ing');
    forms.add(stem + 'ed');
  }
  if (/[^aeiou]y$/.test(lw) && lw.length > 3) {
    const stem = lw.slice(0, -1);
    forms.add(stem + 'ies');
    forms.add(stem + 'ied');
  }
  if (/[^aeiou][aeiou][^aeiouy]$/.test(lw) && lw.length <= 5) {
    forms.add(lw + lw.slice(-1) + 'ed');   // pop → popped
    forms.add(lw + lw.slice(-1) + 'ing');  // pop → popping
  }
  return '(?:' + Array.from(forms).sort((a, b) => b.length - a.length).map(_escapeRe).join('|') + ')';
}

/** 把词典短语编译成变形兼容的正则（带缓存，避免每次重复编译） */
const _phraseReCache = new Map();
function _phraseRegex(item) {
  let re = _phraseReCache.get(item.p);
  if (!re) {
    const body = item.p.trim().split(/\s+/).map(_flexWordRe).join('\\s+');
    re = new RegExp('\\b' + body + '\\b', 'gi');
    _phraseReCache.set(item.p, re);
  }
  re.lastIndex = 0;
  return re;
}

/** 去掉影响朗读/匹配的装饰字符，统一大小写，便于跨来源去重 */
function normalizeColloKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 取文本中 idx 位置所在的完整句子（按 . ! ? 换行断句），
 * 用作「重点口语句块」表格里的例句。
 */
function sentenceAt(text, idx) {
  if (!text || idx == null || idx < 0) return '';
  let s = idx;
  let e = idx;
  while (s > 0 && !/[.!?\n]/.test(text.charAt(s - 1))) s--;
  while (e < text.length && !/[.!?\n]/.test(text.charAt(e))) e++;
  // 把结尾标点带上，更像完整例句
  if (e < text.length) e++;
  let sent = text.slice(s, e).trim();
  if (sent.length > 140) sent = sent.slice(0, 137).trim() + '…';
  return sent;
}

/**
 * 扫描英文文本，找出命中的口语表达（自动兼容动词变形）。
 * @param {string} text 英文日记原文
 * @returns {Array<{display:string, meaning:string, cat:string, count:number}>}
 *   display = 文本里实际出现的形式（保留大小写），按命中次数降序
 */
function detectColloquialisms(text) {
  const hits = new Map(); // 归一化 key -> {display, meaning, cat, count}

  // 短语匹配：逐词变形兼容 + 忽略大小写；同一真实写法只保留一条。
  // 词典里近义词形态条目（如 "end up" / "ended up"）会命中同一处文本，
  // 合并时取最大命中数而非累加，避免次数虚高。
  COLLOQUIAL_PHRASES.forEach((item) => {
    const re = _phraseRegex(item);
    const matches = text.match(re);
    if (matches && matches.length) {
      const key = normalizeColloKey(matches[0]);
      const prev = hits.get(key);
      if (prev) {
        prev.count = Math.max(prev.count, matches.length);
      } else {
        // 取首次命中所在的整句作为例句
        const fm = new RegExp(re.source, 'i').exec(text);
        hits.set(key, {
          display: matches[0],
          meaning: item.m,
          cat: item.cat,
          count: matches.length,
          example: fm ? sentenceAt(text, fm.index) : ''
        });
      }
    }
  });

  // 单词匹配：词边界精确匹配（俚语单词本身就是固定形态）
  COLLOQUIAL_WORDS.forEach((item) => {
    const re = new RegExp('\\b' + _escapeRe(item.w) + '\\b', 'gi');
    const matches = text.match(re);
    if (matches && matches.length) {
      const key = normalizeColloKey(matches[0]);
      if (!hits.has(key)) {
        hits.set(key, {
          display: matches[0],
          meaning: item.m,
          cat: item.cat,
          count: matches.length,
          example: sentenceAt(text, text.search(new RegExp('\\b' + _escapeRe(item.w) + '\\b', 'i')))
        });
      }
    }
  });

  // 去掉被更长命中完全覆盖的短命中：
  // 如 "head out" 与 "head out to" 命中同一处文本（例句相同），只保留更具体的长的那条；
  // 若短命中另有其他出处（例句不同），则两条都保留。
  const arr = Array.from(hits.values());
  const kept = arr.filter((a) => !arr.some((b) =>
    b !== a &&
    a.example === b.example &&
    a.count <= b.count &&
    normalizeColloKey(b.display).indexOf(normalizeColloKey(a.display)) >= 0 &&
    normalizeColloKey(b.display) !== normalizeColloKey(a.display)
  ));

  return kept.sort((a, b) => b.count - a.count);
}
