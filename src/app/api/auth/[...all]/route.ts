import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "~/server/auth";

// 每次请求再取：模块顶层建实例会让无 env 的 `next build` 失败
export function GET(request: Request) {
	return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request) {
	return toNextJsHandler(getAuth()).POST(request);
}
