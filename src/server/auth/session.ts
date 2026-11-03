import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { type AuthSession, getAuth } from "~/server/auth";

/** 同一次渲染里多处取会话只查一次库 */
export const getSession = cache(async (): Promise<AuthSession | null> => {
	// ⚠️ 先 headers() 再 getAuth()：headers() 才让页面成为动态页；反过来写，`next build` 预渲染时
	// getAuth() 先读 env，无 env 的镜像构建直接失败
	const requestHeaders = await headers();
	return getAuth().api.getSession({ headers: requestHeaders });
});

/** 页面用：没登录就去登录页。proxy 只看有没有 cookie，真正的校验在这里 */
export async function requireSession(): Promise<AuthSession> {
	const session = await getSession();
	if (!session) redirect("/sign-in");
	return session;
}
