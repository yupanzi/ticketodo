/** 列表的排序与到期筛选：服务端校验入参、前端读写地址栏都用这里的词表 */

import type { DayRange } from "./due";

export const ITEM_SORTS = ["priority", "due", "created", "updated"] as const;
export type ItemSortBy = (typeof ITEM_SORTS)[number];
export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

export interface ItemSort {
	by: ItemSortBy;
	dir: SortDir;
}

/** 点表头第一下的方向：优先级 P0 在前、期望完成近的在前、时间新的在前 */
export const NATURAL_DIR: Record<ItemSortBy, SortDir> = {
	priority: "asc",
	due: "asc",
	created: "desc",
	updated: "desc",
};

/** 默认先看重要的，同级里先看快到期的（与看板一致） */
export const DEFAULT_SORT: ItemSort = { by: "priority", dir: "asc" };

/**
 * 到期快捷项：overdue / today / next7 只算进行中的（还要做的事），与概览卡片、到期提醒同一口径；
 * none = 没设期望完成日期。自定义范围不限状态，交给状态筛选。
 */
export const DUE_PRESETS = ["overdue", "today", "next7", "none"] as const;
export type DuePreset = (typeof DUE_PRESETS)[number];

export const DUE_PRESET_LABEL: Record<DuePreset, string> = {
	overdue: "已逾期",
	today: "今天到期",
	next7: "7 天内到期",
	none: "未设日期",
};

/** 自定义范围至少给一端：两端都空就是不筛 */
export type DueFilter = DuePreset | DayRange;
