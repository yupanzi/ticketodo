import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	integer,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

import { TAG_COLORS, TAG_NAME_MAX_LENGTH } from "~/domain/tag";

import { user } from "./auth";
import { items } from "./item";
import { createTable } from "./table";

/** 全局标签：谁都能在建单时新建，改名 / 合并 / 删除只有管理员（硬删，关联随之删） */
export const tags = createTable(
	"tag",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		name: varchar("name", { length: TAG_NAME_MAX_LENGTH }).notNull(),
		color: varchar("color", { length: 16, enum: TAG_COLORS })
			.notNull()
			.default("slate"),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "restrict",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	// 大小写不同算同一个标签
	(t) => [uniqueIndex("ticketodo_tag_name_uidx").on(sql`lower(${t.name})`)],
);

export const itemTags = createTable(
	"item_tag",
	{
		itemId: bigint("item_id", { mode: "number" })
			.notNull()
			.references(() => items.id, { onDelete: "cascade" }),
		tagId: integer("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({ columns: [t.itemId, t.tagId], name: "ticketodo_item_tag_pk" }),
		index("ticketodo_item_tag_tag_idx").on(t.tagId),
	],
);
