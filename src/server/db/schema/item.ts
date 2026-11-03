import { sql } from "drizzle-orm";
import {
	bigint,
	check,
	date,
	index,
	integer,
	pgEnum,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

import { ITEM_STATUSES, ITEM_TYPES, TITLE_MAX_LENGTH } from "~/domain/item";
import { PRIORITIES } from "~/domain/priority";

import { user } from "./auth";
import { createTable } from "./table";

export const itemType = pgEnum("ticketodo_item_type", ITEM_TYPES);
export const itemStatus = pgEnum("ticketodo_item_status", ITEM_STATUSES);
export const itemPriority = pgEnum("ticketodo_item_priority", PRIORITIES);

/**
 * ticket 与 todo 同一张表。只软删（deleted_at）：审计与通知里引用的条目要一直在。
 * 指向人的外键一律 RESTRICT：人离职了，他提的单、负责的单不能跟着消失。
 */
export const items = createTable(
	"item",
	{
		id: bigint("id", { mode: "number" })
			.primaryKey()
			.generatedByDefaultAsIdentity(),
		/** `TK-YYYYMMDD-NNNN`，见 `~/domain/item-code`；todo 转 ticket 不变 */
		code: varchar("code", { length: 32 }).notNull().unique(),
		type: itemType("type").notNull(),
		title: varchar("title", { length: TITLE_MAX_LENGTH }).notNull(),
		/** markdown */
		description: text("description").notNull().default(""),
		priority: itemPriority("priority").notNull(),
		status: itemStatus("status").notNull().default("open"),
		/** 提单人；todo 的所有者 */
		reporterId: text("reporter_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		/** ticket 建单必须指定（不存在未指派的单）；todo 恒等于 reporter（CHECK） */
		assigneeId: text("assignee_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		/** 期望完成日期，北京日期；string 模式：date 列转 Date 会被时区挪一天 */
		dueDate: date("due_date", { mode: "string" }),
		/** todo 转成 ticket 的时刻：此前的时间线只有管理员看得到（那时还是私人的） */
		convertedAt: timestamp("converted_at", { withTimezone: true }),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedBy: text("deleted_by").references(() => user.id, {
			onDelete: "restrict",
		}),
	},
	(t) => [
		check(
			"ticketodo_item_todo_owner_check",
			sql`${t.type} <> 'todo' OR ${t.assigneeId} = ${t.reporterId}`,
		),
		index("ticketodo_item_assignee_idx")
			.on(t.assigneeId, t.status)
			.where(sql`${t.deletedAt} IS NULL`),
		index("ticketodo_item_reporter_idx")
			.on(t.reporterId, t.status)
			.where(sql`${t.deletedAt} IS NULL`),
		index("ticketodo_item_type_status_idx")
			.on(t.type, t.status, t.priority)
			.where(sql`${t.deletedAt} IS NULL`),
		// 逾期筛选与到期提醒
		index("ticketodo_item_due_idx")
			.on(t.dueDate)
			.where(
				sql`${t.deletedAt} IS NULL AND ${t.status} IN ('open', 'in_progress')`,
			),
		// 回收站
		index("ticketodo_item_deleted_idx")
			.on(t.deletedAt)
			.where(sql`${t.deletedAt} IS NOT NULL`),
	],
);

/**
 * 单号的当日计数。建单事务里 upsert 取号：随事务回滚、没有空号，行锁串行化同日并发。
 * ⚠️ 别换成 sequence：sequence 不回滚，失败的建单会留下空号。
 */
export const itemCodeSeq = createTable("item_code_seq", {
	day: date("day", { mode: "string" }).primaryKey(),
	last: integer("last").notNull(),
});
