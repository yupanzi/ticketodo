import type { Actor } from "~/domain/policy";
import type { AuditEntry, AuditSource } from "~/server/audit/record";
import type { Database } from "~/server/db";
import type { Log } from "~/server/log";

/** 服务层的调用上下文：API 层从会话或 API key 与请求拼出来，测试直接构造 */
export interface ServiceContext {
	db: Database;
	actor: Actor & { name: string };
	source: AuditSource;
	log: Log;
}

/** 审计里 actor 与请求来源这几列，人发起的动作都一样 */
export function actorAudit(
	ctx: ServiceContext,
): Pick<
	AuditEntry,
	| "actorType"
	| "actorId"
	| "actorName"
	| "ip"
	| "userAgent"
	| "method"
	| "path"
	| "requestId"
	| "apiKeyId"
	| "apiKeyName"
> {
	return {
		actorType: "user",
		actorId: ctx.actor.id,
		actorName: ctx.actor.name,
		...ctx.source,
	};
}
