import { createJsonifiedRouterClient } from "@orpc/openapi";

import type { Context } from "./context";
import { apiInterceptor, os } from "./orpc";
import { commentRouter, itemRouter, viewRouter } from "./routers/item";
import {
	adminRouter,
	apiKeyRouter,
	docsRouter,
	notificationRouter,
	tagRouter,
	userRouter,
} from "./routers/misc";

/** `os.router` 在运行时也核对实现与契约一一对应 */
export const router = os.router({
	item: itemRouter,
	comment: commentRouter,
	view: viewRouter,
	tag: tagRouter,
	user: userRouter,
	notification: notificationRouter,
	apiKey: apiKeyRouter,
	admin: adminRouter,
	docs: docsRouter,
});

export type Router = typeof router;

/**
 * 进程内调用（RSC 预取、测试）：与 HTTP 走同样的中间件与拦截器，返回值也与浏览器拿到的同形
 * （时间戳是 ISO 字符串），预取的数据才能原样交给客户端缓存。
 */
export function createApiClient(context: Context | (() => Promise<Context>)) {
	return createJsonifiedRouterClient(router, {
		context,
		interceptors: [apiInterceptor],
	});
}
