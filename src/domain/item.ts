/** 条目（ticket / todo）的枚举与文案。PG 枚举从这里取值：只加不删 */

export const ITEM_TYPES = ["ticket", "todo"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_STATUSES = [
	"open",
	"in_progress",
	"resolved",
	"closed",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** 还在进行中的状态：看板、逾期、到期提醒只看它们 */
export const ACTIVE_STATUSES = [
	"open",
	"in_progress",
] as const satisfies readonly ItemStatus[];

export const TYPE_LABEL: Record<ItemType, string> = {
	ticket: "Ticket",
	todo: "Todo",
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
	open: "待处理",
	in_progress: "处理中",
	resolved: "已解决",
	closed: "已关闭",
};

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 20_000;
export const COMMENT_MAX_LENGTH = 10_000;
