import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	jsonb,
	pgEnum,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

import type { ItemStatus, ItemType } from "~/domain/item";
import { NOTIFICATION_KINDS } from "~/domain/notify";

import { user } from "./auth";
import { items } from "./item";
import { createTable } from "./table";

export const notificationKind = pgEnum(
	"ticketodo_notification_kind",
	NOTIFICATION_KINDS,
);

/** 写入时的快照：单号、标题改了也看得懂当时发生了什么 */
export interface NotificationPayload {
	code: string;
	title: string;
	itemType: ItemType;
	actorName?: string;
	status?: { from: ItemStatus; to: ItemStatus };
	/** 评论摘录 */
	excerpt?: string;
	dueDate?: string;
}

export const notifications = createTable(
	"notification",
	{
		id: bigint("id", { mode: "number" })
			.primaryKey()
			.generatedByDefaultAsIdentity(),
		recipientId: text("recipient_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		itemId: bigint("item_id", { mode: "number" })
			.notNull()
			.references(() => items.id, { onDelete: "restrict" }),
		/** 系统发的（到期提醒）为空 */
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "restrict",
		}),
		kind: notificationKind("kind").notNull(),
		payload: jsonb("payload").$type<NotificationPayload>().notNull(),
		/** 到期类填期望完成日期，让 cron 重跑幂等、改期后重新提醒；其余为空 */
		dedupeKey: varchar("dedupe_key", { length: 32 }),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("ticketodo_notification_recipient_idx").on(
			t.recipientId,
			t.createdAt,
		),
		index("ticketodo_notification_unread_idx")
			.on(t.recipientId)
			.where(sql`${t.readAt} IS NULL`),
		// ⚠️ 部分索引：dedupe_key 为空的（评论、状态变更）永不冲突。别改成 NULLS NOT DISTINCT
		uniqueIndex("ticketodo_notification_dedupe_uidx")
			.on(t.recipientId, t.itemId, t.kind, t.dedupeKey)
			.where(sql`${t.dedupeKey} IS NOT NULL`),
	],
);
