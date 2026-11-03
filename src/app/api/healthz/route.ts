import { sql } from "drizzle-orm";

import { getDb } from "~/server/db";
import { logger } from "~/server/log";

// 探针：不经会话，只看库通不通
export const dynamic = "force-dynamic";

export async function GET() {
	try {
		await getDb().execute(sql`SELECT 1`);
		return Response.json({ ok: true });
	} catch (err) {
		logger.warn({ err }, "healthz：数据库不可用");
		return Response.json({ ok: false }, { status: 503 });
	}
}
