import "server-only";

import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { headers } from "next/headers";
import { cache } from "react";

import { contextFromHeaders } from "~/server/api/context";
import { createApiClient } from "~/server/api/router";

import { makeQueryClient } from "./query-client";

/** 同一次渲染共享一个 QueryClient：预取的数据随 HydrateClient 交给客户端 */
export const getQueryClient = cache(makeQueryClient);

/** 同一次渲染的几个预取共用一个 context：否则每个预取各查一次会话 */
const rscContext = cache(async () =>
	contextFromHeaders(await headers(), { method: "GET", path: "/rsc" }),
);

/**
 * RSC 预取：进程内直接调 router（不绕 HTTP），key 与浏览器的 `~/orpc/client` 一致。client 是模块级的，
 * context 每次调用现取（`rscContext` 让同一次渲染共用本次请求的会话）。
 */
export const orpc = createTanstackQueryUtils(createApiClient(rscContext));

export function HydrateClient({ children }: { children: React.ReactNode }) {
	return (
		<HydrationBoundary state={dehydrate(getQueryClient())}>
			{children}
		</HydrationBoundary>
	);
}
