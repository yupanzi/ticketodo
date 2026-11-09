/**
 * 优先级即「重要 × 紧急」四象限。库里只存 P 级，象限由它推导：两者一一对应，存两份只会不一致。
 *
 *            紧急          不紧急
 *   重要    P0 立即做      P1 计划做
 *   不重要  P2 委派做      P3 有空做
 */

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * 待定级（priority 为 null）：ticket 的优先级由接收方定，提单人建单时不选；todo 建单即定。
 * 排序时排在 P0 之前（要先有人看一眼才知道急不急）。
 */
export const UNTRIAGED_META = { label: "待定级", hint: "等负责人定级" };

/** 列表筛选的取值：P 级之外多一个「待定级」 */
export const UNTRIAGED = "untriaged";
export const PRIORITY_FILTERS = [...PRIORITIES, UNTRIAGED] as const;
export type PriorityFilter = (typeof PRIORITY_FILTERS)[number];

export interface Quadrant {
	important: boolean;
	urgent: boolean;
}

const QUADRANTS: Record<Priority, Quadrant> = {
	P0: { important: true, urgent: true },
	P1: { important: true, urgent: false },
	P2: { important: false, urgent: true },
	P3: { important: false, urgent: false },
};

export function quadrantOf(priority: Priority): Quadrant {
	return QUADRANTS[priority];
}

export function priorityOf(q: Quadrant): Priority {
	if (q.important) return q.urgent ? "P0" : "P1";
	return q.urgent ? "P2" : "P3";
}

export const PRIORITY_META: Record<Priority, { label: string; hint: string }> =
	{
		P0: { label: "重要且紧急", hint: "立即做" },
		P1: { label: "重要不紧急", hint: "计划做" },
		P2: { label: "紧急不重要", hint: "委派做" },
		P3: { label: "不重要不紧急", hint: "有空做" },
	};
