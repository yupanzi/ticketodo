"use client";

import { useQueryClient } from "@tanstack/react-query";

import type { ItemStatus } from "~/domain/item";
import { itemPermissions } from "~/domain/policy";
import { type RouterOutputs, useTRPC } from "~/trpc/react";
import { useMe } from "./me-context";

type Detail = RouterOutputs["item"]["byCode"];

const codeOf = (data: unknown) =>
	(data as Partial<Detail> | undefined)?.item?.code;

/**
 * 改单之后的缓存规则（item 的 mutation 都回最新详情，见 router 的 `detailAfter`）：
 * 详情当场换成接口回的，看板、列表、概览、时间线在后台刷新。⚠️ 别 await 后台刷新：
 * 按钮会多转一个网络往返，这正是「卡」的来源。
 */
export function useItemCache() {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const me = useMe();

	const apply = (detail: Detail) => {
		const code = detail.item.code;
		qc.setQueryData(trpc.item.byCode.queryKey({ code }), detail);
		// 地址栏里的单号可能是小写：按内容找到缓存了这张单的其他 byCode
		qc.setQueriesData<Detail>(
			{
				queryKey: trpc.item.byCode.pathKey(),
				predicate: (q) => codeOf(q.state.data) === code,
			},
			detail,
		);
		void qc.invalidateQueries({
			queryKey: trpc.item.pathKey(),
			predicate: (q) => codeOf(q.state.data) !== code,
		});
	};

	return {
		apply,

		/**
		 * 状态变更先改界面：按钮集合用与服务端同一个 `itemPermissions` 现算，失败回滚。
		 * 时间戳等派生字段等接口回来再由 `apply` 补齐。
		 */
		async optimisticStatus(detail: Detail, to: ItemStatus) {
			const keyFilter = {
				queryKey: trpc.item.byCode.pathKey(),
				predicate: (q: { state: { data: unknown } }) =>
					codeOf(q.state.data) === detail.item.code,
			};
			await qc.cancelQueries(keyFilter);
			const { item } = detail;
			const next: Detail = {
				item: { ...item, status: to },
				permissions: itemPermissions(me, {
					type: item.type,
					status: to,
					reporterId: item.reporter.id,
					assigneeId: item.assignee.id,
					deletedAt: item.deletedAt,
				}),
			};
			qc.setQueriesData<Detail>(keyFilter, next);
			return () => qc.setQueriesData<Detail>(keyFilter, detail);
		},
	};
}
