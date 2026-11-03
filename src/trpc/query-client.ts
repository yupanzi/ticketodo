import {
	defaultShouldDehydrateQuery,
	QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// RSC 预取后客户端别立刻重取
				staleTime: 30_000,
				// NOT_FOUND / FORBIDDEN 重试也不会变
				retry: (count, err) =>
					count < 2 &&
					!["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST"].includes(
						(err as { data?: { code?: string } }).data?.code ?? "",
					),
			},
			dehydrate: {
				serializeData: superjson.serialize,
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
			hydrate: { deserializeData: superjson.deserialize },
		},
	});
}
