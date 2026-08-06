import { loadCache, refreshAll, state, writeStandaloneData } from "./server.mjs";

loadCache();
await refreshAll();
writeStandaloneData();

const dateCount = new Set(
  state.items.map((item) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
      new Date(item.publishedAt),
    ),
  ),
).size;

console.log(`静态数据已生成：${state.items.length} 条新闻，覆盖 ${dateCount} 天`);
