import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, lt, or, type SQL, sql } from "drizzle-orm";

import {
	API_KEY_PATTERN,
	API_KEY_PREFIX,
	API_KEY_SECRET_LENGTH,
	API_KEY_START_LENGTH,
	type ApiKeyLevel,
} from "~/domain/api-key";
import {
	canIssueApiKey,
	canRevokeApiKey,
	canRotateApiKey,
	isAdmin,
} from "~/domain/policy";
import { auditInTx } from "~/server/audit/record";
import type { Database, Tx } from "~/server/db";
import { apiKeys, type UserRole, user } from "~/server/db/schema";
import { forbidden, notFound } from "~/server/errors";
import type { Log } from "~/server/log";
import { AUDIT_ACTIONS } from "~/server/resources";

import { actorAudit, type ServiceContext } from "./context";
import type { UserRef } from "./item";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 明文 key。拒绝采样（丢掉 ≥ 248 的字节）：直接 `% 62` 会让前几个字符更常出现 */
export function generateApiKey(): string {
	let secret = "";
	while (secret.length < API_KEY_SECRET_LENGTH) {
		for (const b of randomBytes(64)) {
			if (b < 248 && secret.length < API_KEY_SECRET_LENGTH)
				secret += BASE62[b % 62];
		}
	}
	return API_KEY_PREFIX + secret;
}

/** key 是 256 bit 随机数，不怕字典攻击：SHA-256 就够，每个请求都能快速校验 */
export function hashApiKey(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export interface ApiKeyView {
	id: string;
	name: string;
	level: ApiKeyLevel;
	/** 明文前几位，如 `tk_a1b2c3` */
	start: string;
	/** 签发时选的有效期（天），null = 永不过期 */
	ttlDays: number | null;
	expiresAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
	rotatedAt: Date | null;
}

export interface AdminApiKeyView extends ApiKeyView {
	owner: UserRef;
}

const viewColumns = {
	id: apiKeys.id,
	name: apiKeys.name,
	level: apiKeys.level,
	start: apiKeys.start,
	ttlDays: apiKeys.ttlDays,
	expiresAt: apiKeys.expiresAt,
	lastUsedAt: apiKeys.lastUsedAt,
	createdAt: apiKeys.createdAt,
	rotatedAt: apiKeys.rotatedAt,
};

/** 已撤销的不列：它们只在审计里 */
export async function listMyApiKeys(
	ctx: ServiceContext,
): Promise<ApiKeyView[]> {
	return ctx.db
		.select(viewColumns)
		.from(apiKeys)
		.where(and(eq(apiKeys.userId, ctx.actor.id), isNull(apiKeys.revokedAt)))
		.orderBy(desc(apiKeys.createdAt));
}

export async function listAllApiKeys(
	ctx: ServiceContext,
): Promise<AdminApiKeyView[]> {
	if (!isAdmin(ctx.actor)) throw forbidden("只有管理员能看全员的 API key");
	return ctx.db
		.select({
			...viewColumns,
			owner: { id: user.id, name: user.name, image: user.image },
		})
		.from(apiKeys)
		.innerJoin(user, eq(user.id, apiKeys.userId))
		.where(isNull(apiKeys.revokedAt))
		.orderBy(desc(apiKeys.createdAt));
}

/** 过期时刻取库的 now()：与校验时比较的是同一个时钟 */
const expiresAtSql = (ttlDays: number | null): SQL | null =>
	ttlDays === null ? null : sql`now() + make_interval(days => ${ttlDays})`;

function target(key: { id: string; name: string }) {
	return { targetType: "apiKey", targetId: key.id, targetName: key.name };
}

export interface CreateApiKeyInput {
	name: string;
	level: ApiKeyLevel;
	ttlDays: number | null;
}

/** 回明文：只此一次，库里只有哈希 */
export async function createApiKey(
	ctx: ServiceContext,
	input: CreateApiKeyInput,
): Promise<{ key: ApiKeyView; token: string }> {
	if (!canIssueApiKey(ctx.actor, input.level))
		throw forbidden("只有管理员能签管理员级的 API key", {
			targetType: "apiKey",
			targetName: input.name,
		});
	const token = generateApiKey();
	return ctx.db.transaction(async (tx) => {
		const [key] = await tx
			.insert(apiKeys)
			.values({
				userId: ctx.actor.id,
				name: input.name,
				level: input.level,
				start: token.slice(0, API_KEY_START_LENGTH),
				hash: hashApiKey(token),
				ttlDays: input.ttlDays,
				expiresAt: expiresAtSql(input.ttlDays),
			})
			.returning(viewColumns);
		if (!key) throw new Error("签发 API key 失败");
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.apiKeyCreate,
			...target(key),
			details: {
				changes: {
					level: { from: null, to: key.level },
					ttlDays: { from: null, to: key.ttlDays },
				},
			},
			...actorAudit(ctx),
		});
		return { key, token };
	});
}

/** 本人与管理员看得见（能撤销）；别人的一律 NOT_FOUND，与条目同一口径 */
async function lockVisible(tx: Tx, ctx: ServiceContext, id: string) {
	const [key] = await tx
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
		.for("update");
	if (!key || (key.userId !== ctx.actor.id && !isAdmin(ctx.actor)))
		throw notFound("API key");
	return key;
}

/** 换一个新密钥：id、名称、级别不变，旧密钥立即失效；有效期从此刻再给签发时选的天数 */
export async function rotateApiKey(
	ctx: ServiceContext,
	id: string,
): Promise<{ key: ApiKeyView; token: string }> {
	return ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, id);
		if (!canRotateApiKey(ctx.actor, row))
			throw forbidden("只有本人能重新签发自己的 API key", target(row));
		const token = generateApiKey();
		const [key] = await tx
			.update(apiKeys)
			.set({
				start: token.slice(0, API_KEY_START_LENGTH),
				hash: hashApiKey(token),
				expiresAt: expiresAtSql(row.ttlDays),
				rotatedAt: sql`now()`,
				lastUsedAt: null,
			})
			.where(eq(apiKeys.id, id))
			.returning(viewColumns);
		if (!key) throw new Error("重新签发 API key 失败");
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.apiKeyRotate,
			...target(key),
			...actorAudit(ctx),
		});
		return { key, token };
	});
}

export async function revokeApiKey(
	ctx: ServiceContext,
	id: string,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, id);
		if (!canRevokeApiKey(ctx.actor, row))
			throw forbidden("不能撤销别人的 API key", target(row));
		await tx
			.update(apiKeys)
			.set({ revokedAt: sql`now()` })
			.where(eq(apiKeys.id, id));
		const [owner] =
			row.userId === ctx.actor.id
				? []
				: await tx
						.select({ name: user.name })
						.from(user)
						.where(eq(user.id, row.userId));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.apiKeyRevoke,
			...target(row),
			details: owner ? { summary: `撤销 ${owner.name} 的 API key` } : undefined,
			...actorAudit(ctx),
		});
	});
}

export interface VerifiedApiKey {
	key: { id: string; name: string; level: ApiKeyLevel };
	user: { id: string; name: string; role: UserRole; image: string | null };
}

/** `last_used_at` 至多一分钟写一次：AI 连着调时不必每个请求都多一次 UPDATE */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * 校验 Bearer key：格式 → 哈希查表 → 未撤销、未过期（库的 now()）。角色现查 user 表：撤销管理员
 * 立即生效。无效一律回 null，不区分「不存在 / 已撤销 / 已过期」。
 */
export async function verifyApiKey(
	db: Database,
	token: string,
	log: Log,
): Promise<VerifiedApiKey | null> {
	if (!API_KEY_PATTERN.test(token)) return null;
	const [row] = await db
		.select({
			key: { id: apiKeys.id, name: apiKeys.name, level: apiKeys.level },
			user: {
				id: user.id,
				name: user.name,
				role: user.role,
				image: user.image,
			},
			lastUsedAt: apiKeys.lastUsedAt,
		})
		.from(apiKeys)
		.innerJoin(user, eq(user.id, apiKeys.userId))
		.where(
			and(
				eq(apiKeys.hash, hashApiKey(token)),
				isNull(apiKeys.revokedAt),
				or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, sql`now()`)),
			),
		);
	if (!row) return null;
	if (
		!row.lastUsedAt ||
		Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS
	) {
		// 不 await：记录使用时间不该拖慢请求；条件更新防并发请求重复写
		void db
			.update(apiKeys)
			.set({ lastUsedAt: sql`now()` })
			.where(
				and(
					eq(apiKeys.id, row.key.id),
					or(
						isNull(apiKeys.lastUsedAt),
						lt(
							apiKeys.lastUsedAt,
							sql`now() - make_interval(secs => ${TOUCH_INTERVAL_MS / 1000})`,
						),
					),
				),
			)
			.catch((err: unknown) =>
				log.warn({ err, apiKeyId: row.key.id }, "更新 API key 使用时间失败"),
			);
	}
	return { key: row.key, user: row.user };
}
