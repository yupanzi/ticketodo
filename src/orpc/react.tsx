"use client";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { makeQueryClient } from "./query-client";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
	// 服务端每次新建（不跨请求共享）；浏览器里单例，免得 Suspense 重挂载时丢缓存
	if (typeof window === "undefined") return makeQueryClient();
	browserQueryClient ??= makeQueryClient();
	return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
	return (
		<QueryClientProvider client={getQueryClient()}>
			{children}
		</QueryClientProvider>
	);
}
