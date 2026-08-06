# 财经热点雷达

一个本地运行的财经商业热点新闻站：后端定时抓取国内外财经信源，前端自动刷新、支持分类、搜索和热点排序。

## 启动

```bash
node server.mjs
```

如果系统没有全局 `node`，可以用 Codex 运行时自带的 Node：

```bash
/Users/wanghanzhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

启动后访问 <http://localhost:4173>。

## 部署到任何环境

### 1. 云端部署（推荐，实时抓取）

项目自带 `Dockerfile`，可以部署到 Railway、Render、Fly.io 等任意支持 Docker 的平台：

```bash
docker build -t finance-radar .
docker run -p 4173:4173 finance-radar
```

平台会分配一个公网地址，任何设备都能打开，服务端会持续每 10 分钟抓取新闻。

### 2. 免费静态托管（GitHub Pages）

把项目推送到 GitHub 后启用 Pages，仓库自带 `.github/workflows/static-news.yml`，会每 6 小时自动抓取一次新闻并生成 `public/data.js` 快照发布到 `gh-pages` 分支。静态站支持按日期浏览、搜索和重要度筛选，页面会显示“快照更新”状态。

### 3. 局域网或临时公网访问

本机运行服务后，同一网络下的手机/电脑可以通过 `http://本机IP:4173` 访问；临时公网可以用 `cloudflared tunnel` 或 `ngrok` 转发。

## 数据源

- Google 新闻 · 商业（中文）
- Google 新闻 · 中国
- Google 新闻 · 股票市场、全球市场、公司动态、科技互联网（中文）
- Google 新闻 · Business（英文）
- Google 新闻 · Markets、Companies（英文）
- BBC Business
- CNBC Top News
- CNBC Markets、CNBC Technology
- Yahoo Finance
- MarketWatch

服务每 10 分钟自动抓取一次，首次启动也会立即抓取；前端每 60 秒自动轮询，也可以手动点击刷新。新闻会按日期归档到 `news-cache.json`，页面支持按日期查看、搜索和筛选历史内容；每条新闻带“高/中/低”重要度标签，可以按重要度筛选和排序，并会自动过滤天气、娱乐、体育等无关噪声新闻。
