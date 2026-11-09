import { sql } from "drizzle-orm";
import { bigint, index, text, timestamp } from "drizzle-orm/pg-core";

import { apiKeys } from "./api-key";
import { user } from "./auth";
import { items } from "./item";
import { createTable } from "./table";

export const comments = createTable(
	"comment",
	{
		id: bigint("id", { mode: "number" })
			.primaryKey()
			.generatedByDefaultAsIdentity(),
		itemId: bigint("item_id", { mode: "number" })
			.notNull()
			.references(() => items.id, { onDelete: "restrict" }),
		authorId: text("author_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		/** markdown；@ 的写法见 `~/domain/mention` */
		body: text("body").notNull(),
		/** 服务端从正文解析出的被 @ 的 user id（编辑时据此只通知新增的） */
		mentions: text("mentions").array().notNull().default(sql`'{}'::text[]`),
		/** 正文最后一次是经哪个 API key 写的；null = 浏览器。界面据此标「API」 */
		apiKeyId: text("api_key_id").references(() => apiKeys.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("ticketodo_comment_item_idx").on(t.itemId, t.createdAt)],
);
