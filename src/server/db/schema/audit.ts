import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	jsonb,
	pgEnum,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

import {
	AUDIT_ACTOR_TYPES,
	AUDIT_STATUSES,
	type AuditDetails,
	MAX_ACTOR_ID_LENGTH,
	MAX_API_KEY_ID_LENGTH,
	MAX_IP_LENGTH,
	MAX_REQUEST_ID_LENGTH,
	MAX_REQUEST_PATH_LENGTH,
} from "~/domain/audit";

import { createTable } from "./table";

export const auditStatus = pgEnum("ticketodo_audit_status", AUDIT_STATUSES);
export const auditActorType = pgEnum(
	"ticketodo_audit_actor_type",
	AUDIT_ACTOR_TYPES,
);

/**
 * 只追加：迁移里的触发器拒绝 UPDATE / DELETE（防 bug 不防 DBA，表 owner 可以关触发器）。
 * 条目的时间线就是这张表里该条目的成功记录，所以业务写与审计在同一个事务里。
 */
export const auditLogs = createTable(
	"audit_log",
	{
		id: bigint("id", { mode: "number" })
			.primaryKey()
			.generatedByDefaultAsIdentity(),

		at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),

		// actor / target 都是快照、不建外键：人离职、单子删了也要查得到，所以写入时就得拿对
		actorType: auditActorType("actor_type").notNull().default("system"),
		/** better-auth user id / null，见 `AUDIT_ACTOR_TYPES` */
		actorId: varchar("actor_id", { length: MAX_ACTOR_ID_LENGTH }),
		actorName: varchar("actor_name", { length: 255 }),

		/** 取值见 `~/server/resources` 的 `AUDIT_ACTIONS` */
		action: varchar("action", { length: 96 }).notNull(),
		status: auditStatus("status").notNull().default("success"),

		/** 动作串的首段，冗余一列供索引与统计 */
		targetType: varchar("target_type", { length: 64 }).notNull(),
		/** 条目是数字 id，人是 user id */
		targetId: varchar("target_id", { length: 255 }),
		/** 条目是单号，人是姓名 */
		targetName: varchar("target_name", { length: 255 }),

		ip: varchar("ip", { length: MAX_IP_LENGTH }),
		userAgent: text("user_agent"),

		method: varchar("method", { length: 8 }),
		/** 不含 query string */
		path: varchar("path", { length: MAX_REQUEST_PATH_LENGTH }),
		/** `proxy.ts` 定的 x-request-id，与日志的 reqId 同值 */
		requestId: varchar("request_id", { length: MAX_REQUEST_ID_LENGTH }),
		/**
		 * 经 API key 的请求：key id 与名称快照（不建外键，理由同 actor）。null = 浏览器或系统。
		 * 名称进时间线白名单，界面据此标「API」
		 */
		apiKeyId: varchar("api_key_id", { length: MAX_API_KEY_ID_LENGTH }),
		apiKeyName: varchar("api_key_name", { length: 255 }),

		details: jsonb("details").$type<AuditDetails>(),
	},
	(t) => [
		index("ticketodo_audit_log_at_idx").on(t.at),
		index("ticketodo_audit_log_actor_idx").on(t.actorId, t.at),
		index("ticketodo_audit_log_action_idx").on(t.action, t.at),
		// 时间线按它取
		index("ticketodo_audit_log_target_idx").on(t.targetType, t.targetId, t.at),
		index("ticketodo_audit_log_request_id_idx").on(t.requestId),
		// key 泄露时按它查「这个 key 干过什么」；浏览器操作占大多数，只索引非空的
		index("ticketodo_audit_log_api_key_idx")
			.on(t.apiKeyId, t.at)
			.where(sql`${t.apiKeyId} IS NOT NULL`),
	],
);
