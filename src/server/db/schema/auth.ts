import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { USER_ROLES } from "~/domain/policy";

import { createTable } from "./table";

/**
 * better-auth 的四张表。由 `pnpm dlx auth@<better-auth 版本> generate` 生成后改写：加前缀、时间带时区、
 * role 用 PG 枚举。升 better-auth 时重新生成一份对照，缺列要补（adapter 按这里的 JS 键名读写）。
 */

export { USER_ROLES, type UserRole } from "~/domain/policy";

export const userRole = pgEnum("ticketodo_user_role", USER_ROLES);

const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
};

export const user = createTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	/** 没有邮箱的人是合成的 `<sub>@noemail.invalid`（`~/domain/identity`），UI 不展示 */
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	/** 只经管理后台与种子管理员改（`input: false`），见 `~/server/auth/options` */
	role: userRole("role").default("member").notNull(),
	...timestamps,
});

export const session = createTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		...timestamps,
	},
	(t) => [index("ticketodo_session_user_id_idx").on(t.userId)],
);

export const account = createTable(
	"account",
	{
		id: text("id").primaryKey(),
		/** OIDC 的 `sub`：身份就是 (providerId, accountId)，不靠 email */
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 三个 token 是 encryptOAuthTokens 加密后的密文
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		...timestamps,
	},
	(t) => [
		index("ticketodo_account_user_id_idx").on(t.userId),
		// better-auth 不建它；同一个 sub 落成两个账号就是两个人，在库里卡死
		uniqueIndex("ticketodo_account_provider_subject_uidx").on(
			t.providerId,
			t.accountId,
		),
	],
);

export const verification = createTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		...timestamps,
	},
	(t) => [index("ticketodo_verification_identifier_idx").on(t.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] }),
}));
