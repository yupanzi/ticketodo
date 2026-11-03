import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";

import type { ItemType } from "~/domain/item";
import type { NotificationKind, Recipient } from "~/domain/notify";
import type { Executor, Tx } from "~/server/db";
import {
	items,
	type NotificationPayload,
	notifications,
	user,
} from "~/server/db/schema";

import type { ServiceContext } from "./context";

export interface NotifyItem {
	id: number;
	code: string;
	title: string;
	type: ItemType;
}

/** 随业务事务写：通知与改动同生同灭 */
export async function insertNotifications(
	tx: Tx,
	recipients: readonly Recipient[],
	item: NotifyItem,
	actor: { id: string; name: string } | null,
	extra: Partial<NotificationPayload> = {},
): Promise<void> {
	if (recipients.length === 0) return;
	await tx.insert(notifications).values(
		recipients.map((r) => ({
			recipientId: r.recipientId,
			itemId: item.id,
			actorId: actor?.id ?? null,
			kind: r.kind,
			payload: {
				code: item.code,
				title: item.title,
				itemType: item.type,
				...(actor ? { actorName: actor.name } : {}),
				...extra,
			},
		})),
	);
}

export interface NotificationView {
	id: number;
	kind: NotificationKind;
	payload: NotificationPayload;
	readAt: Date | null;
	createdAt: Date;
}

/** 条目被删了的通知不再出现（点进去也是 404） */
export async function listNotifications(
	ctx: ServiceContext,
	opts: { cursor?: number; limit: number; unreadOnly: boolean },
): Promise<{ items: NotificationView[]; nextCursor: number | null }> {
	const rows = await ctx.db
		.select({
			id: notifications.id,
			kind: notifications.kind,
			payload: notifications.payload,
			readAt: notifications.readAt,
			createdAt: notifications.createdAt,
		})
		.from(notifications)
		.innerJoin(items, eq(items.id, notifications.itemId))
		.where(
			and(
				eq(notifications.recipientId, ctx.actor.id),
				isNull(items.deletedAt),
				opts.unreadOnly ? isNull(notifications.readAt) : undefined,
				opts.cursor ? lt(notifications.id, opts.cursor) : undefined,
			),
		)
		.orderBy(desc(notifications.id))
		.limit(opts.limit + 1);
	const page = rows.slice(0, opts.limit);
	return {
		items: page,
		nextCursor: rows.length > opts.limit ? (page.at(-1)?.id ?? null) : null,
	};
}

export async function unreadCount(ctx: ServiceContext): Promise<number> {
	const [row] = await ctx.db
		.select({ n: count() })
		.from(notifications)
		.innerJoin(items, eq(items.id, notifications.itemId))
		.where(
			and(
				eq(notifications.recipientId, ctx.actor.id),
				isNull(notifications.readAt),
				isNull(items.deletedAt),
			),
		);
	return row?.n ?? 0;
}

/** ids 为空 = 全部已读。只动自己的 */
export async function markRead(
	ctx: ServiceContext,
	ids: readonly number[] | "all",
): Promise<void> {
	await ctx.db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notifications.recipientId, ctx.actor.id),
				isNull(notifications.readAt),
				ids === "all" ? undefined : inArray(notifications.id, [...ids]),
			),
		);
}

/** @ 与评论通知只发给看得见这张单的人：ticket 全员，todo 只有所有者与管理员 */
export async function viewersAmong(
	db: Executor,
	item: { type: ItemType; reporterId: string },
	userIds: readonly string[],
): Promise<string[]> {
	if (userIds.length === 0) return [];
	const rows = await db
		.select({ id: user.id, role: user.role })
		.from(user)
		.where(inArray(user.id, [...userIds]));
	return rows
		.filter(
			(u) =>
				item.type === "ticket" ||
				u.id === item.reporterId ||
				u.role === "admin",
		)
		.map((u) => u.id);
}
