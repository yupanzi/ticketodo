import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { contextFromHeaders } from "~/server/api/context";
import { appRouter } from "~/server/api/root";
import { logger } from "~/server/log";

function handler(req: Request) {
	return fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: () =>
			contextFromHeaders(req.headers, {
				method: req.method,
				path: new URL(req.url).pathname,
			}),
		// 500 的详情只进日志（err 走脱敏序列化器）；返回给浏览器的见 errorFormatter
		onError({ error, path, ctx }) {
			if (error.code !== "INTERNAL_SERVER_ERROR") return;
			(ctx?.log ?? logger).error(
				{ err: error.cause ?? error, path },
				"tRPC 内部错误",
			);
		},
	});
}

export { handler as GET, handler as POST };
