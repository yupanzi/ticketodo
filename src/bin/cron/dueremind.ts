import { createDb } from "~/server/db";
import { getTaskEnv } from "~/server/env";
import { logger } from "~/server/log";
import { runDueRemind } from "~/server/services/due-remind";

// CronJob 调用（deploy/values.example.yaml 的 cronJobs.dueremind）。重跑幂等：失败了 Job 重试即可

async function main(): Promise<void> {
	const env = getTaskEnv();
	const db = createDb(env.DATABASE_URL, { maxConnections: 2 });
	const counts = await runDueRemind(db);
	logger.info({ counts }, "到期提醒完成");
	await db.$client.end();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		logger.error({ err }, "到期提醒失败");
		process.exit(1);
	});
