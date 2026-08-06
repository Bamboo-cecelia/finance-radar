#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_FILE = path.join(__dirname, "news-cache.json");
const PORT = Number(process.env.PORT || 4173);
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const FEED_TIMEOUT_MS = 15000;
const MAX_ITEMS_PER_FEED = 35;
const MAX_ARCHIVE_ITEMS = 5000;
const MAX_ARCHIVE_AGE_DAYS = 60;

const NOISE_WORDS = [
  "天气", "食谱", "健身", "宠物", "星座", "娱乐", "明星", "八卦", "足球", "篮球",
  "网球", "奥运", "世界杯", "旅游", "美食", "穿搭", "发型", "美容", "美妆", "游戏攻略",
  "weather", "recipe", "horoscope", "celebrity", "gossip", "sports", "match", "travel",
  "fashion", "makeup", "hair", "quiz", "crossword", "powerball", "lottery",
];

const RELEVANCE_WORDS = [
  "股票", "股市", "市场", "指数", "股价", "财报", "营收", "利润", "并购", "收购",
  "融资", "ipo", "上市", "公司", "企业", "银行", "证券", "保险", "基金", "投资",
  "投资者", "美联储", "央行", "加息", "降息", "利率", "通胀", "关税", "贸易", "经济",
  "gdp", "就业", "失业", "美元", "人民币", "汇率", "黄金", "原油", "期货", "债券",
  "国债", "美债", "科技", "ai", "人工智能", "芯片", "半导体", "互联网", "平台",
  "手机", "汽车", "新能源", "消费", "零售", "房地产", "政策", "监管", "反垄断",
  "市场", "market", "stock", "shares", "earnings", "revenue", "profit", "bank",
  "finance", "investor", "fed", "rate", "tariff", "trade", "economy", "gdp", "jobs",
  "unemployment", "dollar", "gold", "oil", "bond", "tech", "ai", "chip", "semiconductor",
  "app", "platform", "ev", "energy", "retail", "inflation", "recession", "merger",
  "acquisition", "ceo", "company", "business", "腾讯", "阿里", "华为", "苹果", "谷歌",
  "微软", "特斯拉", "英伟达", "台积电", "三星", "亚马逊", "美团", "京东", "字节",
  "抖音", "百度", "小米", "openai", "google", "apple", "microsoft", "tesla", "nvidia",
  "amazon", "meta", "spacex", "moderna", "citadel", "jpmorgan", "goldman", "blackrock",
  "财报", "业绩", "涨停", "跌停", "成交额", "退市", "破产", "裁员", "回购",
];

const IMPORTANT_KEYWORDS = [
  "美联储", "央行", "加息", "降息", "利率决议", "通胀", "cpi", "gdp", "关税",
  "贸易战", "制裁", "财报", "业绩", "营收", "利润", "并购", "收购", "ipo", "上市",
  "退市", "破产", "危机", "暴跌", "暴涨", "熔断", "新高", "纪录", "重磅", "突发",
  "首次", "裁员", "回购", "反垄断", "监管", "债务", "违约", "汇率", "美元", "人民币",
  "黄金", "原油", "芯片", "人工智能", "大模型", "量子", "火箭", "星舰", "fed",
  "rate hike", "inflation", "recession", "tariff", "earnings", "merger", "acquisition",
  "bankruptcy", "record", "plunge", "surge", "crash", "first-ever", "ceo", "解禁",
];

const SOURCE_WEIGHTS = {
  "华尔街见闻": 6,
  "财新": 6,
  "Bloomberg": 7,
  "Reuters": 7,
  "WSJ": 7,
  "CNBC": 6,
  "Financial Times": 6,
  "Economist": 6,
  "新华社": 5,
  "央视": 5,
  "央广": 5,
  "证券时报": 5,
  "上海证券报": 5,
  "第一财经": 5,
  "中国证券报": 5,
  "证券日报": 5,
  "MarketWatch": 5,
  "东方财富": 4,
  "新浪财经": 4,
  "凤凰": 4,
  "Yahoo Finance": 4,
  "BBC": 4,
};

const FEEDS = [
  {
    id: "gn-cn-stocks",
    label: "Google 新闻 · 股票市场",
    region: "国内",
    url: "https://news.google.com/rss/search?q=%E8%82%A1%E7%A5%A8%E5%B8%82%E5%9C%BA%20OR%20%E6%B2%AA%E6%B7%B1%20OR%20%E6%B8%AF%E8%82%A1%20OR%20%E7%BE%8E%E8%82%A1%20when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    keywords: ["股票", "股市", "沪深", "a股", "港股", "美股", "指数", "股价", "证券", "涨停", "跌停", "成交额", "ipo", "上市", "退市", "熔断", "沪指", "深证", "创业板", "恒指", "恒生", "标普", "纳指", "道指", "上证", "深市"],
  },
  {
    id: "gn-cn-global",
    label: "Google 新闻 · 全球市场",
    region: "国际",
    url: "https://news.google.com/rss/search?q=%E5%85%A8%E7%90%83%E5%B8%82%E5%9C%BA%20OR%20%E6%97%A5%E7%BB%8F%20OR%20%E9%9F%A9%E8%82%A1%20OR%20%E6%AC%A7%E6%B4%B2%E8%82%A1%E5%B8%82%20when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    keywords: ["全球", "美股", "欧股", "日经", "韩股", "港股", "亚太", "新兴市场", "指数", "市场", "股市", "油价", "金价", "美元", "汇率", "央行", "美联储", "关税", "贸易"],
  },
  {
    id: "gn-cn-companies",
    label: "Google 新闻 · 公司动态",
    region: "国内",
    url: "https://news.google.com/rss/search?q=%E5%85%AC%E5%8F%B8%E5%8A%A8%E6%80%81%20OR%20%E8%B4%A2%E6%8A%A5%20OR%20%E5%B9%B6%E8%B4%AD%20OR%20%E8%9E%8D%E8%B5%84%20when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    keywords: ["公司", "企业", "财报", "业绩", "营收", "利润", "并购", "收购", "融资", "ipo", "上市", "股价", "高管", "ceo", "减持", "增持", "回购", "股东", "品牌", "门店", "工厂", "裁员", "投资", "合作", "发布"],
  },
  {
    id: "gn-cn-tech",
    label: "Google 新闻 · 科技互联网",
    region: "国内",
    url: "https://news.google.com/rss/search?q=%E4%BA%92%E8%81%94%E7%BD%91%20OR%20AI%20OR%20%E8%8A%AF%E7%89%87%20OR%20%E7%A7%91%E6%8A%80%E5%85%AC%E5%8F%B8%20when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    keywords: ["ai", "人工智能", "芯片", "半导体", "互联网", "科技", "大模型", "openai", "谷歌", "google", "苹果", "华为", "小米", "腾讯", "阿里", "字节", "抖音", "美团", "京东", "百度", "英伟达", "nvidia", "amd", "台积电", "三星", "机器人", "智能体", "软件", "应用", "手机", "电脑", "服务器", "云计算"],
  },
  {
    id: "gn-en-markets",
    label: "Google 新闻 · Markets",
    region: "国际",
    url: "https://news.google.com/rss/search?q=stock%20market%20OR%20global%20markets%20OR%20S%26P%20500%20when:7d&hl=en-US&gl=US&ceid=US:en",
    keywords: ["stock", "market", "stocks", "shares", "index", "dow", "nasdaq", "s&p", "fed", "rate", "inflation", "tariff", "oil", "gold", "bond", "dollar", "earnings", "recession"],
  },
  {
    id: "gn-en-companies",
    label: "Google 新闻 · Companies",
    region: "国际",
    url: "https://news.google.com/rss/search?q=earnings%20OR%20merger%20OR%20acquisition%20OR%20IPO%20when:7d&hl=en-US&gl=US&ceid=US:en",
    keywords: ["earnings", "revenue", "profit", "merger", "acquisition", "ipo", "ceo", "company", "shares", "stock", "layoffs", "bankruptcy", "deal", "buyout", "stake", "quarterly", "results", "guidance"],
  },
  {
    id: "gn-cn-biz",
    label: "Google 新闻 · 商业",
    region: "国内",
    url: "https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx6TVdZU0JYcG9MVU5PR2dKRFRpZ0FQAQ?hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
  },
  {
    id: "gn-cn-top",
    label: "Google 新闻 · 中国",
    region: "国内",
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSkwyMHZNR1F3TlhjekVnVjZhQzFEVGlnQVAB?hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
  },
  {
    id: "gn-en-biz",
    label: "Google 新闻 · Business",
    region: "国际",
    url: "https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx6TVdZU0JYcG9MVU5PR2dKRFRpZ0FQAQ?hl=en-US&gl=US&ceid=US:en",
  },
  {
    id: "bbc-business",
    label: "BBC Business",
    region: "国际",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
  },
  {
    id: "cnbc-top",
    label: "CNBC Top News",
    region: "国际",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147",
  },
  {
    id: "cnbc-markets",
    label: "CNBC Markets",
    region: "国际",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258",
  },
  {
    id: "cnbc-tech",
    label: "CNBC Technology",
    region: "国际",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910",
  },
  {
    id: "yahoo-finance",
    label: "Yahoo Finance",
    region: "国际",
    url: "https://finance.yahoo.com/news/rssindex",
  },
  {
    id: "marketwatch",
    label: "MarketWatch",
    region: "国际",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  },
];

const CATEGORY_RULES = [
  [
    "科技公司",
    [
      "openai", "google", "deepmind", "meta", "facebook", "spacex", "musk",
      "苹果", "apple", "华为", "huawei", "小米", "xiaomi", "腾讯", "tencent",
      "阿里", "alibaba", "字节", "抖音", "tiktok", "美团", "京东", "百度",
      "英伟达", "nvidia", "amd", "台积电", "tsmc", "三星", "samsung",
      "sk hynix", "芯片", "半导体", "ai", "人工智能", "chatgpt", "moderna",
      "hugging face", "微软", "microsoft", "aws", "亚马逊", "amazon",
      "特斯拉", "tesla", "netflix", "disney", "intel", "高通", "qualcomm",
      "甲骨文", "oracle", "腾讯云", "阿里云", "微信", "wechat", "机器人",
      "智能体", "agent", "星舰", "火箭",
    ],
  ],
  [
    "宏观政策",
    [
      "美联储", "fed", "央行", "加息", "降息", "利率", "cpi", "通胀",
      "deflation", "gdp", "关税", "tariff", "政策", "财政", "国债", "美债",
      "treasury", "recession", "衰退", "失业", "就业", "nonfarm", "汇率",
      "人民币", "日元", "美元指数", "欧央行", "日本央行", "imf", "监管",
      "反垄断", "supreme court", "法院", "行政令", "制裁", "补贴", "利率决议",
      "联邦基金", "房地产", "房价", "出口", "进口",
    ],
  ],
  [
    "市场行情",
    [
      "a股", "港股", "美股", "股市", "股票", "指数", "沪指", "深证", "创业板",
      "恒指", "恒生", "纳指", "道指", "标普", "kospi", "日经", "期货", "商品",
      "黄金", "金价", "原油", "油价", "石油", "加密货币", "bitcoin", "以太坊",
      "eth", "开盘", "收盘", "收评", "成交额", "涨停", "跌停", "ipo", "上市",
      "解禁", "板块", "熔断", "反弹", "大涨", "暴跌", "财报", "业绩", "股价",
    ],
  ],
  [
    "银行金融",
    [
      "银行", "证券", "保险", "基金", "理财", "投行", "摩根", "jpmorgan",
      "高盛", "goldman", "花旗", "citi", "瑞银", "ubs", "黑石", "blackstone",
      "桥水", "bridgewater", "贝莱德", "blackrock", "citadel", "对冲基金",
      "hedge fund", "券商", "资管", "贷款", "信贷", "存款", "汇丰", "渣打",
      "工商银行", "建设银行", "中国银行", "农业银行", "金融",
    ],
  ],
];

const HOT_WORDS = [
  "重磅", "突发", "暴跌", "暴涨", "熔断", "崩", "惊", "新高", "历史", "首次",
  "破纪录", "record", "plunge", "surge", "crash", "highest", "first",
  "alert", "breaking", "双雄", "倒计时", "龙头",
];

const state = {
  items: [],
  updatedAt: null,
  feedStatus: [],
  lastError: null,
  refreshing: false,
};

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripHtml(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block, name) {
  const matcher = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i");
  const match = block.match(matcher);
  return match ? match[1] : "";
}

function normalizeTitle(title = "") {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function hashText(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function autoTag(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const scored = CATEGORY_RULES.map(([name, words]) => [
    name,
    words.reduce((count, word) => count + (text.includes(word.toLowerCase()) ? 1 : 0), 0),
  ]).sort((a, b) => b[1] - a[1]);
  return scored[0][1] > 0 ? scored[0][0] : "公司动态";
}

function filterItem(item, feed = {}) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (Array.isArray(feed.keywords) && feed.keywords.length) {
    if (!feed.keywords.some((word) => text.includes(word.toLowerCase()))) return false;
  }
  const hasNoise = NOISE_WORDS.some((word) => text.includes(word.toLowerCase()));
  const hasRelevance = RELEVANCE_WORDS.some((word) => text.includes(word.toLowerCase()));
  if (hasNoise && !hasRelevance) return false;
  return true;
}

function computeImportance(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let score = 20;
  const sourceEntry = Object.entries(SOURCE_WEIGHTS).find(([name]) => item.source.includes(name));
  if (sourceEntry) score += sourceEntry[1];

  const categoryBase = {
    "宏观政策": 14,
    "银行金融": 11,
    "市场行情": 9,
    "科技公司": 8,
    "公司动态": 5,
  };
  score += categoryBase[item.category] || 5;

  const keywordHits = IMPORTANT_KEYWORDS.reduce(
    (count, word) => count + (text.includes(word.toLowerCase()) ? 1 : 0),
    0,
  );
  score += Math.min(32, keywordHits * 5);

  const breakingHits = HOT_WORDS.reduce(
    (count, word) => count + (text.includes(word.toLowerCase()) ? 1 : 0),
    0,
  );
  score += Math.min(10, breakingHits * 2);

  if (item.category === "公司动态" && keywordHits === 0) score -= 14;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function importanceTier(importance) {
  if (importance >= 55) return "高";
  if (importance >= 34) return "中";
  return "低";
}

function scoreItem(item, now = Date.now()) {
  const ageMs = Math.max(0, now - new Date(item.publishedAt).getTime());
  const ageHours = ageMs / 3_600_000;
  const freshness = Math.max(0.2, 1 - ageHours / 48);
  const text = `${item.title} ${item.description}`.toLowerCase();
  const boost = HOT_WORDS.reduce((count, word) => count + (text.includes(word.toLowerCase()) ? 1 : 0), 0);
  const sourceBoost =
    item.source.includes("华尔街见闻") ||
    item.source.includes("Bloomberg") ||
    item.source.includes("Reuters") ||
    item.source.includes("CNBC")
      ? 0.4
      : 0;
  return Math.round((freshness * 60 + boost * 9 + sourceBoost * 8) * 100) / 100;
}

function parseRss(xml, feed) {
  const items = [];
  const itemPattern = /<item[\s\S]*?<\/item>/g;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[0];
    let rawTitle = decodeEntities(tag(block, "title")).replace(/\s+/g, " ").trim();
    const rawSource = decodeEntities(tag(block, "source")) || decodeEntities(tag(block, "dc:creator")) || feed.label;
    const source = rawSource.replace(/\s+/g, " ").trim() || feed.label;
    const suffix = ` - ${source}`;
    if (rawTitle.endsWith(suffix)) {
      rawTitle = rawTitle.slice(0, -suffix.length).trim();
    }
    const link = decodeEntities(tag(block, "link")).trim();
    let description = stripHtml(decodeEntities(tag(block, "description")))
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 420);
    if (feed.id.startsWith("gn-") && description.includes("  ")) {
      description = description.split("  ")[0].trim();
    }
    if (description.startsWith(rawTitle)) {
      description = description.slice(rawTitle.length).replace(/^[\s:：|-]+/, "").trim();
    }
    description = description.slice(0, 320);
    const pubDateRaw = decodeEntities(tag(block, "pubDate")).trim();
    const publishedAt = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString();
    if (!rawTitle || !link) continue;
    items.push({
      title: rawTitle,
      link,
      source,
      feedLabel: feed.label,
      region: feed.region,
      description,
      publishedAt,
      category: autoTag(rawTitle, description),
    });
  }
  return items.slice(0, MAX_ITEMS_PER_FEED);
}

async function fetchFeed(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        accept: "application/xml,text/xml,application/rss+xml,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseRss(xml, feed).filter((item) => filterItem(item, feed));
  } catch {
    return [];
  }
}

function mergeFeeds(results, previousItems = []) {
  const map = new Map();
  const now = Date.now();
  for (const item of previousItems) {
    if (!filterItem(item)) continue;
    const key = normalizeTitle(item.title);
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        sources: item.sources || [item.source],
        importance: computeImportance(item),
        score: scoreItem(item, now),
      });
    }
  }
  for (const [feed, items] of results) {
    for (const item of items) {
      const key = normalizeTitle(item.title);
      const existing = map.get(key);
      if (existing) {
        existing.sources = [...new Set([...(existing.sources || []), item.source])];
        existing.score = scoreItem(existing, now);
        existing.importance = computeImportance(existing);
        continue;
      }
      map.set(key, {
        ...item,
        id: hashText(key),
        sources: [item.source],
        firstSeenAt: new Date(now).toISOString(),
        score: scoreItem(item, now),
        importance: computeImportance(item),
      });
    }
  }
  const cutoff = now - MAX_ARCHIVE_AGE_DAYS * 86_400_000;
  return [...map.values()]
    .filter(
      (item) =>
        new Date(item.publishedAt).getTime() >= cutoff ||
        (item.firstSeenAt && new Date(item.firstSeenAt).getTime() >= cutoff),
    )
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_ARCHIVE_ITEMS);
}

function writeCache() {
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify(
        { savedAt: state.updatedAt, items: state.items, feedStatus: state.feedStatus },
        null,
        2,
      ),
    );
  } catch {
    // Cache is best-effort; the site still works in memory.
  }
}

function writeStandaloneData() {
  try {
    const payload = JSON.stringify({
      updatedAt: state.updatedAt,
      feedStatus: state.feedStatus,
      items: state.items.slice(0, 400),
    }).replace(/</g, "\\u003c");
    fs.writeFileSync(path.join(PUBLIC_DIR, "data.js"), `window.__NEWS_DATA__ = ${payload};\n`);
  } catch {
    // Standalone snapshot is best-effort.
  }
}

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const data = JSON.parse(raw);
    state.items = Array.isArray(data.items) ? data.items : [];
    state.updatedAt = data.savedAt || null;
    state.feedStatus = Array.isArray(data.feedStatus) ? data.feedStatus : [];
  } catch {
    // First run, no cache yet.
  }
}

async function refreshAll() {
  if (state.refreshing) return state;
  state.refreshing = true;
  try {
    const results = await Promise.all(FEEDS.map(async (feed) => [feed, await fetchFeed(feed)]));
    state.items = mergeFeeds(results, state.items);
    state.updatedAt = new Date().toISOString();
    state.feedStatus = results.map(([feed, items]) => ({
      id: feed.id,
      label: feed.label,
      region: feed.region,
      ok: items.length > 0,
      count: items.length,
    }));
    state.lastError = null;
    writeCache();
    writeStandaloneData();
  } catch (error) {
    state.lastError = String(error?.message || error);
  } finally {
    state.refreshing = false;
  }
  return state;
}

function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".map": "application/json",
    }[ext] || "application/octet-stream";
    let payload = data;
    if (ext === ".html") {
      const initialData = JSON.stringify({
        updatedAt: state.updatedAt,
        feedStatus: state.feedStatus,
        items: state.items.slice(0, 400),
      }).replace(/</g, "\\u003c");
      payload = Buffer.from(
        data
          .toString("utf8")
          .replace("<!--INITIAL_DATA-->", initialData),
      );
    }
    res.writeHead(200, {
      "content-type": mime,
      "cache-control": ext === ".html" ? "no-cache" : "no-cache",
    });
    res.end(payload);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/news") {
    const lastUpdate = state.updatedAt ? new Date(state.updatedAt).getTime() : 0;
    if (Date.now() - lastUpdate > STALE_AFTER_MS) {
      await refreshAll();
    }
    sendJson(res, {
      updatedAt: state.updatedAt,
      refreshing: state.refreshing,
      feedStatus: state.feedStatus,
      lastError: state.lastError,
      items: state.items,
    });
    return;
  }

  if (pathname === "/api/refresh") {
    await refreshAll();
    sendJson(res, {
      updatedAt: state.updatedAt,
      refreshing: state.refreshing,
      feedStatus: state.feedStatus,
      lastError: state.lastError,
      items: state.items,
    });
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, { error: "not found" }, 404);
    return;
  }

  serveStatic(req, res, pathname);
});

export { FEEDS, loadCache, refreshAll, state, writeStandaloneData };

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  loadCache();
  writeStandaloneData();
  server.listen(PORT, "::", () => {
    console.log(`财经热点雷达已启动: http://localhost:${PORT}`);
    console.log(`IPv6 地址: http://[::1]:${PORT}`);
    refreshAll().catch(() => {});
  });

  setInterval(() => {
    refreshAll().catch(() => {});
  }, REFRESH_INTERVAL_MS);
}
