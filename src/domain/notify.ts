import type { ItemType } from "./item";

/**
 * 业务事件 → 站内通知的收件人。规则：不通知操作者自己；同一事件里一个人只收一条（被 @ 的不再收
 * 「有新评论」）；todo 是私人的，只会通知到所有者（管理员替人改了 todo 时）。
 */

export const NOTIFICATION_KINDS = [
	"assigned",
	"status_changed",
	"commented",
	"mentioned",
	"due_soon",
	"overdue",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_LABEL: Record<NotificationKind, string> = {
	assigned: "指派给你",
	status_changed: "状态变更",
	commented: "新评论",
	mentioned: "提到了你",
	due_soon: "即将到期",
	overdue: "已逾期",
};

interface ItemParties {
	type: ItemType;
	reporterId: string;
	assigneeId: string;
}

export type NotifyEvent =
	/** 建单指派给别人、改派、todo 转 ticket */
	| { kind: "assigned"; actorId: string; item: ItemParties }
	| { kind: "status_changed"; actorId: string; item: ItemParties }
	| {
			kind: "commented";
			actorId: string;
			item: ItemParties;
			/** 已过滤成「存在且看得见这张单」的人 */
			mentionedIds: readonly string[];
	  };

export interface Recipient {
	recipientId: string;
	kind: NotificationKind;
}

/** 与这张单有关的人：ticket 是提单人与负责人，todo 只有所有者 */
function parties(item: ItemParties): string[] {
	return item.type === "ticket"
		? [item.reporterId, item.assigneeId]
		: [item.reporterId];
}

function unique(ids: Iterable<string>): string[] {
	return [...new Set(ids)];
}

export function recipientsFor(event: NotifyEvent): Recipient[] {
	const notActor = (id: string) => id !== event.actorId;
	switch (event.kind) {
		case "assigned": {
			// 新负责人收「指派给你」；提单人只在别人替他改派时知会一声
			const out: Recipient[] = [];
			if (notActor(event.item.assigneeId))
				out.push({ recipientId: event.item.assigneeId, kind: "assigned" });
			if (
				event.item.type === "ticket" &&
				notActor(event.item.reporterId) &&
				event.item.reporterId !== event.item.assigneeId
			)
				out.push({
					recipientId: event.item.reporterId,
					kind: "status_changed",
				});
			return out;
		}
		case "status_changed":
			return unique(parties(event.item))
				.filter(notActor)
				.map((recipientId) => ({ recipientId, kind: "status_changed" }));
		case "commented": {
			const mentioned = unique(event.mentionedIds).filter(notActor);
			const others = unique(parties(event.item))
				.filter(notActor)
				.filter((id) => !mentioned.includes(id));
			return [
				...mentioned.map((recipientId) => ({
					recipientId,
					kind: "mentioned" as const,
				})),
				...others.map((recipientId) => ({
					recipientId,
					kind: "commented" as const,
				})),
			];
		}
	}
}
