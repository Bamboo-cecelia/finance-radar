const state = {
  items: [],
  updatedAt: null,
  feedStatus: [],
  refreshing: false,
  lastError: null,
  category: "全部",
  query: "",
  sort: "latest",
  date: "all",
  importance: "all",
};

const els = {
  clock: document.querySelector("#clock span"),
  statusPill: document.getElementById("statusPill"),
  statusText: document.querySelector("#statusPill span:last-child"),
  refreshBtn: document.getElementById("refreshBtn"),
  searchInput: document.getElementById("searchInput"),
  categoryTabs: document.getElementById("categoryTabs"),
  autoRefresh: document.getElementById("autoRefresh"),
  sortSelect: document.getElementById("sortSelect"),
  importanceSelect: document.getElementById("importanceSelect"),
  dateSelect: document.getElementById("dateSelect"),
  itemCount: document.getElementById("itemCount"),
  updatedLabel: document.getElementById("updatedLabel"),
  sourceCount: document.getElementById("sourceCount"),
  archiveDays: document.getElementById("archiveDays"),
  archiveList: document.getElementById("archiveList"),
  feedHint: document.getElementById("feedHint"),
  newsList: document.getElementById("newsList"),
  emptyState: document.getElementById("emptyState"),
  skeleton: document.getElementById("skeleton"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  heroMeta: document.getElementById("heroMeta"),
  heroTitle: document.getElementById("heroTitle"),
  heroDesc: document.getElementById("heroDesc"),
  heroLink: document.getElementById("heroLink"),
  heroRank: document.getElementById("heroRank"),
  heroScore: document.getElementById("heroScore"),
  hotList: document.getElementById("hotList"),
  catBars: document.getElementById("catBars"),
  importanceBars: document.getElementById("importanceBars"),
  sourceList: document.getElementById("sourceList"),
};

const standaloneBanner = document.getElementById("standaloneBanner");
if (location.protocol === "file:") {
  standaloneBanner.hidden = false;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativeTime(iso) {
  if (!iso) return "–";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function shanghaiDateKey(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

function shiftDateKey(key, days) {
  const date = new Date(`${key}T12:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return shanghaiDateKey(date.toISOString());
}

function dateLabel(key) {
  const today = shanghaiDateKey(new Date().toISOString());
  const yesterday = shiftDateKey(today, -1);
  if (key === today) return "今天";
  if (key === yesterday) return "昨天";
  const date = new Date(`${key}T12:00:00+08:00`);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日 ${weekdays[date.getDay()]}`;
}

function importanceTier(importance = 0) {
  if (importance >= 55) return "高";
  if (importance >= 34) return "中";
  return "低";
}

function loadInitialData() {
  let data = null;
  try {
    const raw = document.getElementById("initial-data").textContent.trim();
    if (raw) data = JSON.parse(raw);
  } catch {
    // The page still works after the first API call.
  }
  if (!data && window.__NEWS_DATA__) data = window.__NEWS_DATA__;
  if (data && Array.isArray(data.items) && data.items.length) {
    state.items = data.items;
    state.updatedAt = data.updatedAt || null;
    state.feedStatus = Array.isArray(data.feedStatus) ? data.feedStatus : [];
  }
}

function getFilteredItems() {
  const query = state.query.trim().toLowerCase();
  const today = shanghaiDateKey(new Date().toISOString());
  return state.items.filter((item) => {
    if (state.category === "国内" || state.category === "国际") {
      if (item.region !== state.category) return false;
    } else if (state.category !== "全部") {
      if (item.category !== state.category) return false;
    }
    if (state.date !== "all") {
      const key = shanghaiDateKey(item.publishedAt);
      if (state.date === "today" && key !== today) return false;
      if (state.date === "yesterday" && key !== shiftDateKey(today, -1)) return false;
      if (state.date === "7d") {
        const diffDays = Math.round(
          (new Date(`${today}T00:00:00+08:00`) - new Date(`${key}T00:00:00+08:00`)) / 86400000,
        );
        if (diffDays < 0 || diffDays > 6) return false;
      }
      if (state.date.length === 10 && key !== state.date) return false;
    }
    if (state.importance !== "all") {
      const tier = importanceTier(item.importance);
      if (state.importance === "high" && tier !== "高") return false;
      if (state.importance === "medium_high" && tier === "低") return false;
    }
    if (!query) return true;
    const haystack = `${item.title} ${item.description} ${item.source} ${item.feedLabel}`.toLowerCase();
    return haystack.includes(query);
  });
}

function createIcon(name) {
  const icon = document.createElement("i");
  icon.dataset.lucide = name;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function span(text, className) {
  const node = document.createElement("span");
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function dot() {
  return span("·", "dot");
}

function buildCard(item) {
  const card = document.createElement("article");
  const catClass = `cat-${(item.category || "公司动态").replace(/\s+/g, "")}`;
  card.className = `news-card ${catClass}`;

  const main = document.createElement("div");
  main.className = "news-main";

  const kicker = document.createElement("div");
  kicker.className = "news-kicker";

  const catBadge = span(item.category || "公司动态", "badge badge-cat");
  const regionBadge = span(item.region === "国际" ? "国际" : "国内", "badge badge-region");
  const importanceBadge = span(`重要 · ${importanceTier(item.importance)}`, `badge badge-imp-${importanceTier(item.importance)}`);
  kicker.append(catBadge, regionBadge, importanceBadge);
  if (item.score >= 26) {
    kicker.appendChild(span("热点", "badge badge-hot"));
  }

  const title = document.createElement("h3");
  title.className = "news-title";
  const titleLink = document.createElement("a");
  titleLink.href = item.link;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = item.title;
  title.appendChild(titleLink);

  main.appendChild(kicker);
  main.appendChild(title);

  if (item.description) {
    const desc = document.createElement("p");
    desc.className = "news-desc";
    desc.textContent = item.description;
    main.appendChild(desc);
  }

  const footer = document.createElement("div");
  footer.className = "news-footer";
  footer.append(
    span(item.source || "未知"),
    dot(),
    span(relativeTime(item.publishedAt)),
    dot(),
    span("热度 " + Math.round(item.score)),
  );
  main.appendChild(footer);

  const aside = document.createElement("div");
  aside.className = "news-aside";

  const open = document.createElement("a");
  open.className = "open-link";
  open.href = item.link;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "阅读原文";
  open.prepend(createIcon("external-link"));

  const feed = document.createElement("div");
  feed.className = "feed-source";
  feed.textContent = item.feedLabel || item.source || "";
  feed.title = feed.textContent;

  aside.append(open, feed);
  card.append(main, aside);
  return card;
}

function renderList() {
  const items = getFilteredItems();
  const sorted = [...items].sort((a, b) => {
    if (state.sort === "hot") {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
    }
    if (state.sort === "important") {
      const diff = (b.importance || 0) - (a.importance || 0);
      if (diff !== 0) return diff;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const fragment = document.createDocumentFragment();
  if (state.date === "all") {
    const groups = new Map();
    for (const item of sorted) {
      const key = shanghaiDateKey(item.publishedAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const [key, groupItems] of groups) {
      const group = document.createElement("section");
      group.className = "date-group";
      const head = document.createElement("div");
      head.className = "date-group-head";
      const title = document.createElement("h3");
      title.textContent = dateLabel(key);
      const count = document.createElement("span");
      count.textContent = `${groupItems.length} 条`;
      head.append(title, count);
      const list = document.createElement("div");
      list.className = "news-list";
      list.replaceChildren(...groupItems.map(buildCard));
      group.append(head, list);
      fragment.appendChild(group);
    }
  } else {
    fragment.append(...sorted.map(buildCard));
  }

  els.newsList.replaceChildren(fragment);
  els.emptyState.hidden = sorted.length > 0;
  els.skeleton.hidden = true;
  els.feedHint.textContent = sorted.length
    ? `显示 ${sorted.length} / ${state.items.length} 条`
    : state.items.length
      ? "无匹配结果"
      : "等待首轮抓取";

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function renderHero() {
  if (!state.items.length) {
    els.heroMeta.textContent = "等待数据";
    els.heroTitle.textContent = "正在抓取今日重点新闻…";
    els.heroDesc.textContent = "";
    els.heroLink.href = "#";
    els.heroRank.textContent = "#1";
    els.heroScore.textContent = "–";
    return;
  }
  const hero = [...state.items].sort((a, b) => {
    const impDiff = (b.importance || 0) - (a.importance || 0);
    if (impDiff !== 0) return impDiff;
    return b.score - a.score;
  })[0];
  els.heroMeta.textContent = `${hero.source || "未知来源"} · ${relativeTime(hero.publishedAt)}`;
  els.heroTitle.textContent = hero.title;
  els.heroDesc.textContent = hero.description || "";
  els.heroLink.href = hero.link;
  els.heroRank.textContent = "#1";
  els.heroScore.textContent = String(Math.round(hero.score));
}

function renderHotList() {
  const top = [...state.items].sort((a, b) => {
    const impDiff = (b.importance || 0) - (a.importance || 0);
    if (impDiff !== 0) return impDiff;
    return b.score - a.score;
  }).slice(0, 5);
  const list = document.createElement("ol");
  list.className = "hot-list";
  top.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "hot-item";
    const rank = span(String(index + 1).padStart(2, "0"), "hot-rank");
    const link = document.createElement("a");
    link.className = "hot-link";
    link.href = item.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    const score = span(`热点 ${Math.round(item.score)} · ${item.source || "未知"}`, "hot-score");
    li.append(rank, link, score);
    list.appendChild(li);
  });
  els.hotList.replaceChildren(list);
}

function renderCatBars() {
  const counts = new Map();
  for (const item of state.items) {
    const category = item.category || "公司动态";
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...sorted.map(([, count]) => count));
  const wrap = document.createElement("div");
  wrap.className = "cat-bars";
  for (const [name, count] of sorted) {
    const row = document.createElement("div");
    row.className = "cat-row";
    const top = document.createElement("div");
    top.className = "cat-row-top";
    top.append(span(name), span(`${count} 条`, "cat-count"));
    const track = document.createElement("div");
    track.className = "cat-track";
    const fill = document.createElement("div");
    fill.className = "cat-fill";
    fill.style.width = `${Math.max(6, Math.round((count / max) * 100))}%`;
    track.appendChild(fill);
    row.append(top, track);
    wrap.appendChild(row);
  }
  els.catBars.replaceChildren(wrap);
}

function renderImportance() {
  const counts = { 高: 0, 中: 0, 低: 0 };
  for (const item of state.items) {
    const tier = importanceTier(item.importance);
    counts[tier] = (counts[tier] || 0) + 1;
  }
  const total = Math.max(1, state.items.length);
  const wrap = document.createElement("div");
  wrap.className = "importance-bars";
  for (const tier of ["高", "中", "低"]) {
    const row = document.createElement("div");
    row.className = "importance-row";
    const top = document.createElement("div");
    top.className = "importance-row-top";
    top.append(span(`${tier}重要`), span(`${counts[tier]} 条`));
    const track = document.createElement("div");
    track.className = "importance-track";
    const fill = document.createElement("div");
    const fillClass = tier === "高" ? "" : tier === "中" ? " mid" : " low";
    fill.className = `importance-fill${fillClass}`;
    fill.style.width = `${Math.max(3, Math.round((counts[tier] / total) * 100))}%`;
    track.appendChild(fill);
    row.append(top, track);
    wrap.appendChild(row);
  }
  els.importanceBars.replaceChildren(wrap);
}

function renderSourceList() {
  const list = document.createElement("ul");
  list.className = "source-list";
  const rows = state.feedStatus.length ? state.feedStatus : [
    { id: "pending", label: "等待抓取", ok: true, count: 0 },
  ];
  for (const source of rows) {
    const li = document.createElement("li");
    li.className = `source-row${source.ok ? "" : " is-down"}`;
    const dot = span("", "source-dot");
    const name = span(source.label || source.id, "source-name");
    const count = span(`${source.count || 0} 条`, "source-count");
    li.append(dot, name, count);
    list.appendChild(li);
  }
  els.sourceList.replaceChildren(list);
}

function renderArchive() {
  const counts = new Map();
  for (const item of state.items) {
    const key = shanghaiDateKey(item.publishedAt);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dates = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const wrap = document.createElement("div");
  wrap.className = "archive-list";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `archive-btn${state.date === "all" ? " is-active" : ""}`;
  allBtn.dataset.date = "all";
  allBtn.append(document.createTextNode("全部日期"));
  const allCount = document.createElement("strong");
  allCount.textContent = `${state.items.length} 条`;
  allBtn.appendChild(allCount);
  wrap.appendChild(allBtn);

  for (const [key, count] of dates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `archive-btn${state.date === key ? " is-active" : ""}`;
    btn.dataset.date = key;
    btn.append(document.createTextNode(dateLabel(key)));
    const strong = document.createElement("strong");
    strong.textContent = `${count} 条`;
    btn.appendChild(strong);
    wrap.appendChild(btn);
  }
  els.archiveList.replaceChildren(wrap);
}

function renderDateOptions() {
  const current = els.dateSelect.value;
  const dates = new Set(state.items.map((item) => shanghaiDateKey(item.publishedAt)));
  const sorted = [...dates].sort((a, b) => (a < b ? 1 : -1));
  els.dateSelect.replaceChildren(
    option("all", "全部日期"),
    option("today", "今天"),
    option("yesterday", "昨天"),
    option("7d", "近 7 天"),
    ...sorted.map((key) => option(key, `${dateLabel(key)} (${key})`)),
  );
  if ([...els.dateSelect.options].some((opt) => opt.value === current)) {
    els.dateSelect.value = current;
  } else {
    els.dateSelect.value = "all";
    state.date = "all";
  }
}

function option(value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function renderSummary() {
  const total = state.items.length;
  els.itemCount.textContent = total ? String(total) : "–";
  els.updatedLabel.textContent = relativeTime(state.updatedAt);

  const sourceSet = new Set(state.items.map((item) => item.source).filter(Boolean));
  els.sourceCount.textContent = sourceSet.size ? String(sourceSet.size) : "–";

  const dates = new Set();
  for (const item of state.items) {
    dates.add(shanghaiDateKey(item.publishedAt));
  }
  els.archiveDays.textContent = dates.size ? String(dates.size) : "–";
}

function updateStatus() {
  els.statusPill.classList.remove("is-error", "is-offline");
  if (state.refreshing) {
    els.statusPill.classList.add("is-loading");
    els.statusText.textContent = "更新中";
    return;
  }
  els.statusPill.classList.remove("is-loading");
  if (state.lastError && state.items.length > 0) {
    els.statusPill.classList.add("is-offline");
    els.statusText.textContent = `连接中断 · 上次更新 ${relativeTime(state.updatedAt)}`;
    return;
  }
  if (state.lastError && state.items.length === 0) {
    els.statusPill.classList.add("is-error");
    els.statusText.textContent = "连接失败";
  } else if (state.updatedAt) {
    els.statusText.textContent = `实时更新 · ${relativeTime(state.updatedAt)}`;
  } else {
    els.statusText.textContent = "正在连接";
  }
}

function updateClearButton() {
  const active =
    state.category !== "全部" ||
    state.query.trim() !== "" ||
    state.sort !== "latest" ||
    state.date !== "all" ||
    state.importance !== "all";
  els.clearFiltersBtn.hidden = !active;
}

function renderAll() {
  renderDateOptions();
  renderList();
  renderHero();
  renderHotList();
  renderArchive();
  renderCatBars();
  renderImportance();
  renderSourceList();
  renderSummary();
  updateStatus();
  updateClearButton();
}

function startClock() {
  const update = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    els.clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  };
  update();
  setInterval(update, 1000);
}

async function fetchData({ silent = false } = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch("/api/news", { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    state.updatedAt = data.updatedAt;
    state.feedStatus = Array.isArray(data.feedStatus) ? data.feedStatus : [];
    state.refreshing = Boolean(data.refreshing);
    state.lastError = data.lastError || null;
    renderAll();
  } catch (error) {
    state.lastError = error.message;
    if (!silent && state.items.length === 0) {
      els.emptyState.hidden = false;
      els.emptyState.querySelector("p").textContent = "连接服务器失败，请确认服务已启动。";
      els.skeleton.hidden = true;
    }
    updateStatus();
  }
}

async function manualRefresh() {
  els.refreshBtn.classList.add("is-spinning");
  els.statusPill.classList.add("is-loading");
  els.statusText.textContent = "正在抓取";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    await fetch("/api/refresh", { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    await fetchData();
  } catch (error) {
    state.lastError = error.message;
    updateStatus();
  } finally {
    els.refreshBtn.classList.remove("is-spinning");
  }
}

function bindEvents() {
  els.refreshBtn.addEventListener("click", manualRefresh);

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value;
    renderList();
    updateClearButton();
  });

  els.categoryTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) return;
    state.category = button.dataset.cat;
    for (const tab of els.categoryTabs.querySelectorAll(".seg-btn")) {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    renderList();
    updateClearButton();
  });

  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    renderList();
    updateClearButton();
  });

  els.importanceSelect.addEventListener("change", () => {
    state.importance = els.importanceSelect.value;
    renderList();
    updateClearButton();
  });

  els.dateSelect.addEventListener("change", () => {
    state.date = els.dateSelect.value;
    renderList();
    renderArchive();
    updateClearButton();
  });

  els.archiveList.addEventListener("click", (event) => {
    const button = event.target.closest(".archive-btn");
    if (!button) return;
    state.date = button.dataset.date;
    els.dateSelect.value = state.date;
    renderList();
    renderArchive();
    updateClearButton();
  });

  els.clearFiltersBtn.addEventListener("click", () => {
    state.category = "全部";
    state.query = "";
    state.sort = "latest";
    state.date = "all";
    state.importance = "all";
    els.searchInput.value = "";
    els.sortSelect.value = "latest";
    els.importanceSelect.value = "all";
    els.dateSelect.value = "all";
    for (const tab of els.categoryTabs.querySelectorAll(".seg-btn")) {
      const active = tab.dataset.cat === "全部";
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    renderList();
    updateClearButton();
  });

  setInterval(() => {
    if (els.autoRefresh.checked) {
      fetchData({ silent: true });
    }
  }, 30000);
}

loadInitialData();
startClock();
bindEvents();
renderAll();
fetchData().catch(() => {});

window.addEventListener("error", () => {
  els.statusPill.classList.add("is-error");
  els.statusText.textContent = "页面脚本异常，请刷新";
});
