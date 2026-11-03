import "server-only";

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";

import { contextFromHeaders } from "~/server/api/context";
import { appRouter } from "~/server/api/root";

import { makeQueryClient } from "./query-client";

/** 同一次渲染共享一个 QueryClient：预取的数据随 HydrateClient 交给客户端 */
export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
	ctx: async () =>
		contextFromHeaders(await headers(), { method: "GET", path: "/rsc" }),
	router: appRouter,
	queryClient: getQueryClient,
});

export function HydrateClient({ children }: { children: React.ReactNode }) {
	return (
		<HydrationBoundary state={dehydrate(getQueryClient())}>
			{children}
		</HydrationBoundary>
	);
}
