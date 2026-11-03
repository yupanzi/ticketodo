import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "~/server/db";
import { getTaskEnv } from "~/server/env";
import { logger } from "~/server/log";
import { MIGRATIONS } from "~/server/resources";

// Helm pre-install/pre-upgrade hook 调用。`./drizzle` 相对容器工作目录

async function main(): Promise<void> {
	const env = getTaskEnv();
	// 走共用工厂：长时间的 CREATE INDEX 同样需要那里的 TCP keepAlive
	const db = createDb(env.DATABASE_URL, { maxConnections: 1 });

	logger.info("开始执行数据库迁移");
	await migrate(db, {
		migrationsFolder: "./drizzle",
		migrationsTable: MIGRATIONS.table,
		migrationsSchema: MIGRATIONS.schema,
	});
	logger.info("数据库迁移完成");

	await db.$client.end();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		logger.error({ err }, "数据库迁移失败");
		process.exit(1);
	});
