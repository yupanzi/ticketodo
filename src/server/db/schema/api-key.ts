import { sql } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

import {
	API_KEY_LEVELS,
	API_KEY_NAME_MAX_LENGTH,
	API_KEY_START_LENGTH,
} from "~/domain/api-key";

import { user } from "./auth";
import { createTable } from "./table";

export const apiKeyLevel = pgEnum("ticketodo_api_key_level", API_KEY_LEVELS);

/**
 * 个人 API key（`~/domain/api-key`）。⚠️ 只存 SHA-256：明文只在签发 / 重新签发的响应里出现一次。
 * 撤销是软删（`revoked_at`）：审计与评论按 id 引用它，名称要一直查得到。
 */
export const apiKeys = createTable(
	"api_key",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: varchar("name", { length: API_KEY_NAME_MAX_LENGTH }).notNull(),
		level: apiKeyLevel("level").notNull(),
		/** 明文的前几位，列表里认 key 用 */
		start: varchar("start", { length: API_KEY_START_LENGTH }).notNull(),
		hash: text("hash").notNull(),
		/** 签发时选的有效期（天）；重新签发从那一刻再给这么久。null = 永不过期 */
		ttlDays: integer("ttl_days"),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		/** 按分钟节流写（`services/api-key.ts`），不是每个请求都写 */
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		rotatedAt: timestamp("rotated_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("ticketodo_api_key_hash_idx").on(t.hash),
		index("ticketodo_api_key_user_idx").on(t.userId, t.createdAt),
	],
);
