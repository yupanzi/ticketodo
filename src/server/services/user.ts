import { asc, count, eq, ilike, or, sql } from "drizzle-orm";

import { hasRealEmail } from "~/domain/identity";
import { auditInTx } from "~/server/audit/record";
import type { Executor } from "~/server/db";
import { type UserRole, user } from "~/server/db/schema";
import { AppError, notFound } from "~/server/errors";
import { ADVISORY_LOCKS, AUDIT_ACTIONS } from "~/server/resources";

import { actorAudit, type ServiceContext } from "./context";

export interface UserOption {
	id: string;
	name: string;
	image: string | null;
	/** 合成的占位邮箱不下发 */
	email: string | null;
}

function toOption(u: {
	id: string;
	name: string;
	image: string | null;
	email: string;
}): UserOption {
	return { ...u, email: hasRealEmail(u.email) ? u.email : null };
}

/** 指派与 @ 的人选：只有登录过的人（user 表里的） */
export async function searchUsers(
	db: Executor,
	q: string,
	limit: number,
): Promise<UserOption[]> {
	const term = q.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			image: user.image,
			email: user.email,
		})
		.from(user)
		.where(
			term
				? or(ilike(user.name, `%${term}%`), ilike(user.email, `%${term}%`))
				: undefined,
		)
		.orderBy(asc(user.name))
		.limit(limit);
	return rows.map(toOption);
}

export interface AdminUserView extends UserOption {
	role: UserRole;
	createdAt: Date;
}

export async function listUsersForAdmin(
	db: Executor,
): Promise<AdminUserView[]> {
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			image: user.image,
			email: user.email,
			role: user.role,
			createdAt: user.createdAt,
		})
		.from(user)
		.orderBy(asc(user.createdAt));
	return rows.map((r) => ({ ...r, ...toOption(r) }));
}

/**
 * 授予 / 撤销管理员。advisory lock 串行化：否则两个并发撤销都看到「还剩 2 个」，结果一个不剩，
 * 而一个不剩时 BOOTSTRAP_ADMIN_EMAILS 又会重新生效。
 */
export async function setUserRole(
	ctx: ServiceContext,
	userId: string,
	role: UserRole,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_LOCKS.adminRoles}))`,
		);
		const [target] = await tx
			.select({ id: user.id, name: user.name, role: user.role })
			.from(user)
			.where(eq(user.id, userId))
			.for("update");
		if (!target) throw notFound("用户");
		if (target.role === role) return;
		if (role === "member") {
			const [row] = await tx
				.select({ n: count() })
				.from(user)
				.where(eq(user.role, "admin"));
			if ((row?.n ?? 0) <= 1)
				throw new AppError("CONFLICT", "至少要保留一名管理员");
		}
		await tx.update(user).set({ role }).where(eq(user.id, userId));
		await auditInTx(tx, {
			action:
				role === "admin" ? AUDIT_ACTIONS.adminGrant : AUDIT_ACTIONS.adminRevoke,
			targetType: "user",
			targetId: target.id,
			targetName: target.name,
			details: { changes: { role: { from: target.role, to: role } } },
			...actorAudit(ctx),
		});
	});
}
