import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "~/server/db";
import { MIGRATIONS } from "~/server/resources";

/** 测试库先迁到最新：集成测试断言的是当前 schema */
export default async function setup(): Promise<void> {
	const url = process.env.TEST_DATABASE_URL;
	if (!url) return;
	const db = createDb(url, { maxConnections: 1 });
	try {
		await migrate(db, {
			migrationsFolder: "./drizzle",
			migrationsTable: MIGRATIONS.table,
			migrationsSchema: MIGRATIONS.schema,
		});
	} finally {
		await db.$client.end();
	}
}
