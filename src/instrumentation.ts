import type { Instrumentation } from "next";

/**
 * 启动即校验 env：缺了直接起不来，而不是等第一个请求才 500。动态 import：本文件也会进 edge 的编译，
 * 那边没有 pino / pg / process.exit。
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	// `next build` 也会加载本文件；构建期没有 env，校验留给运行时
	if (process.env.NEXT_PHASE === "phase-production-build") return;
	const { assertServerEnv } = await import("./server/startup");
	assertServerEnv();
}

/** RSC 渲染、route handler 里逃出的异常：走 pino（脱敏），不留给 Next 的 console 输出 */
export const onRequestError: Instrumentation.onRequestError = async (
	err,
	request,
	context,
) => {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { logger } = await import("./server/log");
	const { normalizeRequestPath } = await import("./domain/audit");
	const { REQUEST_ID_HEADER } = await import("./server/request");
	const reqId = request.headers[REQUEST_ID_HEADER];
	logger.error(
		{
			err,
			reqId: typeof reqId === "string" ? reqId : undefined,
			method: request.method,
			path: normalizeRequestPath(request.path),
			route: context.routePath,
			routeType: context.routeType,
		},
		"请求处理出错",
	);
};
