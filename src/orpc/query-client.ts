import { ORPCError } from "@orpc/client";
import {
	defaultShouldDehydrateQuery,
	QueryClient,
} from "@tanstack/react-query";

/** 重试也不会变的错误：看不见、不让做、没登录、参数错 */
const NO_RETRY = new Set([
	"NOT_FOUND",
	"FORBIDDEN",
	"UNAUTHORIZED",
	"BAD_REQUEST",
]);

/**
 * 数据都是纯 JSON（时间戳是 ISO 字符串，RSC 预取用的也是同形的 jsonified client），预取下发不需要
 * 自定义序列化。
 */
export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// RSC 预取后客户端别立刻重取
				staleTime: 30_000,
				retry: (count, err) =>
					count < 2 && !(err instanceof ORPCError && NO_RETRY.has(err.code)),
			},
			dehydrate: {
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
		},
	});
}
