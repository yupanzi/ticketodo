import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { type Contract, contract } from "~/contract";

/**
 * 浏览器调 API：与 AI 打同一组 REST 端点（`/api/v1`），cookie 认证。时间戳在这里是 ISO 字符串
 * （`JsonifiedClient`），显示一律走 `~/lib/format`。
 */
export type ApiClient = JsonifiedClient<ContractRouterClient<Contract>>;

const link = new OpenAPILink(contract, {
	// 服务端渲染客户端组件时不该发请求（数据由 RSC 预取下发）；真发了就是漏了预取
	url: () => {
		if (typeof window === "undefined")
			throw new Error("服务端渲染时没有预取这条查询：在页面的 RSC 里 prefetch");
		return `${window.location.origin}/api/v1`;
	},
});

export const client: ApiClient = createORPCClient(link);

/** 查询与变更的 options / key：与 `~/orpc/server` 的预取同一套路径，key 才对得上 */
export const orpc = createTanstackQueryUtils(client);

type Outputs<T> = {
	[K in keyof T]: T[K] extends (...args: never[]) => Promise<infer R>
		? R
		: Outputs<T[K]>;
};
/** 浏览器拿到的响应类型（时间戳是 string） */
export type ApiOutputs = Outputs<ApiClient>;
