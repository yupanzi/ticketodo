"use client";

import { hashKey, useQueryClient } from "@tanstack/react-query";

import type { ItemStatus } from "~/domain/item";
import { itemPermissions } from "~/domain/policy";
import { type RouterOutputs, useTRPC } from "~/trpc/react";
import { useMe } from "./me-context";

type Detail = RouterOutputs["item"]["byCode"];

/**
 * 改单之后的缓存规则（item 的 mutation 都回最新详情，见 router 的 `detailAfter`）：
 * 详情当场换成接口回的，看板、列表、概览、时间线在后台刷新。⚠️ 别 await 后台刷新：
 * 按钮会多转一个网络往返，这正是「卡」的来源。单号的 key 只有大写一种（详情页路由会转大写）。
 */
export function useItemCache() {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const me = useMe();
	const keyOf = (code: string) => trpc.item.byCode.queryKey({ code });

	return {
		apply(detail: Detail) {
			const key = keyOf(detail.item.code);
			qc.setQueryData(key, detail);
			void qc.invalidateQueries({
				queryKey: trpc.item.pathKey(),
				predicate: (q) => q.queryHash !== hashKey(key),
			});
		},

		/**
		 * 状态变更先改界面：按钮集合用与服务端同一个 `itemPermissions` 现算，返回回滚函数。
		 * 时间戳等派生字段等接口回来再由 `apply` 补齐。
		 */
		async optimisticStatus(detail: Detail, to: ItemStatus) {
			const key = keyOf(detail.item.code);
			await qc.cancelQueries({ queryKey: key });
			const { item } = detail;
			qc.setQueryData(key, {
				item: { ...item, status: to },
				permissions: itemPermissions(me, {
					type: item.type,
					status: to,
					reporterId: item.reporter.id,
					assigneeId: item.assignee.id,
					deletedAt: item.deletedAt,
				}),
			});
			return () => qc.setQueryData(key, detail);
		},
	};
}
