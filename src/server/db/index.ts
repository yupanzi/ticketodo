import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { libpqUrl } from "~/server/db/libpq-url";
import * as schema from "~/server/db/schema";
import { getTaskEnv } from "~/server/env";

// casing 必须与 drizzle.config.ts 一致，否则运行时列名对不上
const DRIZZLE_OPTS = { schema, casing: "snake_case" } as const;

export type Database = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** 事务内外都能用的执行器 */
export type Executor = Database | Tx;

interface DbOptions {
	maxConnections?: number;
}

export function createDb(connectionString: string, opts: DbOptions = {}) {
	const pool = new Pool({
		connectionString: libpqUrl(connectionString),
		max: opts.maxConnections ?? 10,
		connectionTimeoutMillis: 5_000,
		idleTimeoutMillis: 30_000,
		// 默认关闭：空闲连接会被 NAT/LB 静默丢弃（偶发 "Connection terminated unexpectedly"）
		keepAlive: true,
		keepAliveInitialDelayMillis: 10_000,
	});

	return drizzle(pool, DRIZZLE_OPTS);
}

const g = globalThis as { __ticketodoDb?: Database };

/**
 * web 进程的单例。挂在 globalThis：dev 的 HMR 与 instrumentation / 各路由的 bundle 各自求值本模块，
 * 放模块变量里会各开一个池。只读 `DATABASE_URL`（taskEnv）：bin 入口不拿认证凭证也能用它。
 */
export function getDb(): Database {
	g.__ticketodoDb ??= createDb(getTaskEnv().DATABASE_URL);
	return g.__ticketodoDb;
}

export { schema };
