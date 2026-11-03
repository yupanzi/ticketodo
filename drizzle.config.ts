import { defineConfig } from "drizzle-kit";

import { libpqUrl } from "./src/server/db/libpq-url";
import { MIGRATIONS } from "./src/server/resources";

// 显式加载 .env，不依赖 drizzle-kit 的隐式行为（失败症状是静默连到默认库）
try {
	process.loadEnvFile(".env");
} catch {}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 未设置");

export default defineConfig({
	schema: "./src/server/db/schema",
	out: "./drizzle",
	dialect: "postgresql",
	// ⚠️ 必须与 `~/server/db/index.ts` 的 casing 一致
	casing: "snake_case",
	dbCredentials: { url: libpqUrl(url) },
	// ⚠️ 与 `bin/migrate.ts` 读同一处：两边记账表不同，CI 迁过的生产会再迁一遍
	migrations: MIGRATIONS,
	// 共库时只管自己的表
	tablesFilter: ["ticketodo_*"],
});
