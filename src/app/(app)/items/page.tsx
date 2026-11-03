import type { Metadata } from "next";

import {
	DEFAULT_STATUSES,
	ItemsTable,
	type ListFilterState,
	type Mine,
} from "~/components/items-table";
import { ITEM_STATUSES, ITEM_TYPES } from "~/domain/item";
import { PRIORITIES } from "~/domain/priority";

export const metadata: Metadata = { title: "全部单子" };

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) =>
	typeof v === "string" ? v : undefined;

/** 地址栏 → 筛选：只认合法值，其余回落默认（链接可能是手改的） */
function parseFilters(p: Params): ListFilterState {
	const list = <T extends string>(
		raw: string | undefined,
		allowed: readonly T[],
	) => (raw ?? "").split(",").filter((x): x is T => allowed.includes(x as T));
	const mine = one(p.mine);
	const type = one(p.type);
	const statuses = list(one(p.status), ITEM_STATUSES);
	return {
		mine: mine === "assigned" || mine === "reported" ? (mine as Mine) : "all",
		type: ITEM_TYPES.find((t) => t === type) ?? "any",
		statuses: one(p.status) === undefined ? DEFAULT_STATUSES : statuses,
		priorities: list(one(p.priority), PRIORITIES),
		tagId: /^\d+$/.test(one(p.tag) ?? "") ? (one(p.tag) as string) : "any",
		overdue: one(p.overdue) === "1",
		dueToday: one(p.due) === "today",
		q: one(p.q) ?? "",
	};
}

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
	return <ItemsTable initial={parseFilters(await searchParams)} />;
}
