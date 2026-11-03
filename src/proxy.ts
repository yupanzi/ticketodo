import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { getServerEnv, trustsProxyHeaders } from "~/server/env";
import { REQUEST_ID_HEADER, resolveRequestId } from "~/server/request";
import { AUTH_COOKIE_PREFIX } from "~/server/resources";

/**
 * 两件事：给每个请求定 x-request-id（写进请求头传给下游、也回给客户端），页面没有会话 cookie 时去登录页。
 * 只看 cookie 在不在，不查库：真正的会话校验在 `requireSession` 与 tRPC 的 protectedProcedure。
 */
export function proxy(request: NextRequest) {
	const env = getServerEnv();
	const requestId = resolveRequestId(
		request.headers.get(REQUEST_ID_HEADER),
		trustsProxyHeaders(env),
	);
	const { pathname, search } = request.nextUrl;

	const isPage = !pathname.startsWith("/api/") && pathname !== "/sign-in";
	if (
		isPage &&
		!getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })
	) {
		// 用对外地址拼：request.url 在代理后面可能是 Pod 的内部地址
		const signIn = new URL("/sign-in", env.BETTER_AUTH_URL);
		if (pathname !== "/") signIn.searchParams.set("next", pathname + search);
		const response = NextResponse.redirect(signIn);
		response.headers.set(REQUEST_ID_HEADER, requestId);
		return response;
	}

	const headers = new Headers(request.headers);
	headers.set(REQUEST_ID_HEADER, requestId);
	// ⚠️ 是 `request: { headers }`：写成 `{ headers }` 是把头发给浏览器，下游拿不到
	const response = NextResponse.next({ request: { headers } });
	response.headers.set(REQUEST_ID_HEADER, requestId);
	return response;
}

export const config = {
	// 静态资源与 public/ 下的文件不经过它：否则 robots.txt 也被重定向到登录页
	matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
