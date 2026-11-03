import type { GenericEndpointContext } from "@better-auth/core";
import { getIP } from "@better-auth/core/utils/ip";
import type { BetterAuthOptions } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { and, eq, notExists, sql } from "drizzle-orm";

import { hasRealEmail, oauthErrorCode } from "~/domain/identity";
import {
	type AuditSource,
	auditInTx,
	recordAuditSafe,
} from "~/server/audit/record";
import type { Database } from "~/server/db";
import { user } from "~/server/db/schema";
import type { ServerEnv } from "~/server/env";
import { logger } from "~/server/log";
import { REQUEST_ID_HEADER } from "~/server/request";
import { ADVISORY_LOCKS, AUDIT_ACTIONS } from "~/server/resources";

/**
 * 登录类审计与种子管理员。⚠️ 这里的每个 hook 都自己吞错：hook 抛出会让 OAuth 回调重定向到错误页，
 * 审计或种子管理员出问题不能变成「谁都登录不了」。
 */

type IpOptions = Pick<BetterAuthOptions, "advanced">;

function sourceOf(ctx: GenericEndpointContext | null): AuditSource {
	const request = ctx?.request;
	return {
		method: request?.method ?? null,
		path: request ? new URL(request.url).pathname : null,
		requestId:
			ctx?.headers?.get(REQUEST_ID_HEADER) ??
			request?.headers.get(REQUEST_ID_HEADER) ??
			null,
	};
}

async function findUser(db: Database, id: string) {
	const [row] = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, id));
	return row;
}

/**
 * 系统里还没有管理员、且邮箱在 `BOOTSTRAP_ADMIN_EMAILS` 里 → 升为管理员。授予与审计同一个事务；
 * advisory lock 让「判断有没有管理员」与授予、撤销互斥。
 */
async function bootstrapAdmin(
	db: Database,
	env: ServerEnv,
	u: { id: string; name: string; email: string },
	source: AuditSource,
): Promise<void> {
	const email = u.email.toLowerCase();
	if (!hasRealEmail(email) || !env.BOOTSTRAP_ADMIN_EMAILS.includes(email))
		return;
	await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_LOCKS.adminRoles}))`,
		);
		const admins = tx
			.select({ one: sql`1` })
			.from(user)
			.where(eq(user.role, "admin"));
		const promoted = await tx
			.update(user)
			.set({ role: "admin" })
			.where(and(eq(user.id, u.id), notExists(admins)))
			.returning({ id: user.id });
		if (promoted.length === 0) return;
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.adminBootstrap,
			actorType: "system",
			targetType: "user",
			targetId: u.id,
			targetName: u.name,
			details: {
				summary: "系统内尚无管理员，BOOTSTRAP_ADMIN_EMAILS 生效",
				changes: { role: { from: "member", to: "admin" } },
			},
			...source,
		});
	});
}

export function authHooks(
	db: Database,
	env: ServerEnv,
	ipOptions: IpOptions,
): Pick<BetterAuthOptions, "databaseHooks" | "hooks"> {
	return {
		databaseHooks: {
			user: {
				create: {
					after: async (created, ctx) => {
						await recordAuditSafe(db, {
							action: AUDIT_ACTIONS.userCreate,
							actorType: "user",
							actorId: created.id,
							actorName: created.name,
							targetType: "user",
							targetId: created.id,
							targetName: created.name,
							details: { summary: "首次登录建档" },
							...sourceOf(ctx),
						});
					},
				},
			},
			session: {
				create: {
					after: async (session, ctx) => {
						const source: AuditSource = {
							...sourceOf(ctx),
							ip: session.ipAddress ?? null,
							userAgent: session.userAgent ?? null,
						};
						try {
							const u = await findUser(db, session.userId);
							if (!u) return;
							try {
								await bootstrapAdmin(db, env, u, source);
							} catch (err) {
								logger.error(
									{ err, reqId: source.requestId },
									"种子管理员授予失败",
								);
							}
							await recordAuditSafe(db, {
								action: AUDIT_ACTIONS.authSignIn,
								actorType: "user",
								actorId: u.id,
								actorName: u.name,
								targetType: "user",
								targetId: u.id,
								targetName: u.name,
								...source,
							});
						} catch (err) {
							logger.error({ err, reqId: source.requestId }, "登录审计失败");
						}
					},
				},
				delete: {
					after: async (session, ctx) => {
						// 只记主动登出；过期清理等别的删除路径不算
						if (ctx?.path !== "/sign-out") return;
						try {
							const u = await findUser(db, session.userId);
							await recordAuditSafe(db, {
								action: AUDIT_ACTIONS.authSignOut,
								actorType: "user",
								actorId: session.userId,
								actorName: u?.name ?? null,
								targetType: "user",
								targetId: session.userId,
								targetName: u?.name ?? null,
								ip: ctx.request ? getIP(ctx.request, ipOptions) : null,
								userAgent: ctx.request?.headers.get("user-agent") ?? null,
								...sourceOf(ctx),
							});
						} catch (err) {
							logger.error({ err }, "登出审计失败");
						}
					},
				},
			},
		},
		hooks: {
			// 回调失败一律以 302 抛出、错误码在 Location 的 `error` 里；after hook 照样会跑。尽力而为
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/callback/:id") return;
				const location = ctx.context.responseHeaders?.get("location");
				if (!location) return;
				const error = new URL(location, "http://placeholder").searchParams.get(
					"error",
				);
				if (error === null) return;
				const request = ctx.request;
				await recordAuditSafe(db, {
					action: AUDIT_ACTIONS.authReject,
					status: "failure",
					actorType: "user",
					targetType: "auth",
					details: { summary: `OAuth 回调失败：${oauthErrorCode(error)}` },
					ip: request ? getIP(request, ipOptions) : null,
					userAgent: request?.headers.get("user-agent") ?? null,
					...sourceOf(ctx),
				});
			}),
		},
	};
}
