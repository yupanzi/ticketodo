import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";

import { getServerEnv } from "~/server/env";

import { type Context, contextFromHeaders } from "./context";
import { API_PREFIX, schemaConverters } from "./openapi";
import { apiInterceptor } from "./orpc";
import { router } from "./router";

let handler: OpenAPIHandler<Context> | undefined;

/** 惰性：构建期会 import 路由模块，别在模块顶层建 */
function getHandler(): OpenAPIHandler<Context> {
	handler ??= new OpenAPIHandler(router, {
		// GET 的参数在 query string 里全是字符串：按 schema 还原成数字、布尔
		plugins: [new SmartCoercionPlugin({ schemaConverters })],
		clientInterceptors: [apiInterceptor],
	});
	return handler;
}

function errorResponse(status: number, code: string, message: string) {
	return Response.json({ defined: false, code, status, message }, { status });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF：靠 cookie 认证的写请求，Origin 必须是本站。Bearer 不受影响：浏览器不会替跨站页面自动带上它。
 * oRPC 也收表单编码的请求体，只靠 SameSite=Lax 挡不住同站子域。
 */
function crossSiteWrite(request: Request, context: Context): boolean {
	if (SAFE_METHODS.has(request.method)) return false;
	if (!context.principal || context.principal.apiKey) return false;
	return request.headers.get("origin") !== getServerEnv().BETTER_AUTH_URL;
}

/** `/api/v1/*` 的唯一入口：浏览器与 AI 都打这里 */
export async function handleApiRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const context = await contextFromHeaders(request.headers, {
		method: request.method,
		path: url.pathname,
	});
	if (crossSiteWrite(request, context)) {
		context.log.warn(
			{ origin: request.headers.get("origin"), path: url.pathname },
			"拒绝跨站写请求",
		);
		return errorResponse(403, "FORBIDDEN", "跨站请求被拒绝");
	}
	const { matched, response } = await getHandler().handle(request, {
		prefix: API_PREFIX,
		context,
	});
	if (matched) return response;
	return errorResponse(
		404,
		"NOT_FOUND",
		`没有这个接口：${request.method} ${url.pathname}（接口列表见 ${API_PREFIX}/openapi.json）`,
	);
}
