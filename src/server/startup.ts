import { getServerEnv } from "~/server/env";
import { logger } from "~/server/log";

/**
 * web 进程启动即校验 env，不过就退出。⚠️ 别改成 throw：Next 只打一行「Failed to prepare server」，
 * 进程照样活着，Pod 一直 Running 却永远不 ready，看不出是配置错了。
 */
export function assertServerEnv(): void {
	try {
		getServerEnv();
	} catch (err) {
		logger.fatal({ err }, "启动失败");
		process.exit(1);
	}
}
