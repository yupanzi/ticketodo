import type { ItemStatus, ItemType } from "./item";

/**
 * 状态机。ticket：负责人推进到「已解决」，提单人确认关闭或打回；提单人也能撤回、重开。
 * todo：本人自己推进，不经「已解决」。管理员可走任意一条合法边，但走不出图外的边。
 */

/** 对条目而言的身份；todo 的所有者在 ticket 的语义里同时是提单人与负责人 */
export type ItemRole = "reporter" | "assignee";

interface Edge {
	from: ItemStatus;
	to: ItemStatus;
	by: readonly ItemRole[];
	/** 时间线与审计 summary 里的动作名 */
	label: string;
}

const TICKET_EDGES: readonly Edge[] = [
	{ from: "open", to: "in_progress", by: ["assignee"], label: "开始处理" },
	{ from: "in_progress", to: "open", by: ["assignee"], label: "退回待处理" },
	{ from: "open", to: "resolved", by: ["assignee"], label: "标记已解决" },
	{
		from: "in_progress",
		to: "resolved",
		by: ["assignee"],
		label: "标记已解决",
	},
	{ from: "resolved", to: "closed", by: ["reporter"], label: "确认关闭" },
	{ from: "resolved", to: "in_progress", by: ["reporter"], label: "打回重做" },
	{ from: "open", to: "closed", by: ["reporter"], label: "撤回" },
	{ from: "in_progress", to: "closed", by: ["reporter"], label: "撤回" },
	{ from: "closed", to: "open", by: ["reporter"], label: "重开" },
];

const TODO_EDGES: readonly Edge[] = [
	{ from: "open", to: "in_progress", by: ["reporter"], label: "开始处理" },
	{ from: "in_progress", to: "open", by: ["reporter"], label: "退回待处理" },
	{ from: "open", to: "closed", by: ["reporter"], label: "完成" },
	{ from: "in_progress", to: "closed", by: ["reporter"], label: "完成" },
	{ from: "closed", to: "open", by: ["reporter"], label: "重开" },
];

function edgesOf(type: ItemType): readonly Edge[] {
	return type === "ticket" ? TICKET_EDGES : TODO_EDGES;
}

export function findEdge(
	type: ItemType,
	from: ItemStatus,
	to: ItemStatus,
): Edge | undefined {
	return edgesOf(type).find((e) => e.from === from && e.to === to);
}

/** 从 from 出发、按身份能走的目标状态（管理员传 isAdmin，任意合法边） */
export function nextStatuses(
	type: ItemType,
	from: ItemStatus,
	roles: ReadonlySet<ItemRole>,
	isAdmin: boolean,
): ItemStatus[] {
	return edgesOf(type)
		.filter(
			(e) => e.from === from && (isAdmin || e.by.some((r) => roles.has(r))),
		)
		.map((e) => e.to);
}

/**
 * 进出状态时时间戳怎么变：进「已解决」记 resolvedAt，进「已关闭」记 closedAt；离开它们（打回、
 * 重开）就清掉，免得重开的单子还带着上一轮的完成时间。
 */
export function statusTimestamps(
	from: ItemStatus,
	to: ItemStatus,
	now: Date,
): { resolvedAt?: Date | null; closedAt?: Date | null } {
	const out: { resolvedAt?: Date | null; closedAt?: Date | null } = {};
	if (to === "resolved") out.resolvedAt = now;
	if (to === "closed") out.closedAt = now;
	if (from === "closed") out.closedAt = null;
	// 已解决 → 已关闭保留 resolvedAt（何时解决、何时确认是两件事）
	if (
		(from === "resolved" || from === "closed") &&
		to !== "closed" &&
		to !== "resolved"
	)
		out.resolvedAt = null;
	return out;
}
