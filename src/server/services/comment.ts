import { asc, eq, inArray } from "drizzle-orm";

import {
	addedMentions,
	mentionsToPlain,
	parseMentions,
} from "~/domain/mention";
import { recipientsFor } from "~/domain/notify";
import {
	canComment,
	canDeleteComment,
	canEditComment,
	canView,
} from "~/domain/policy";
import { auditInTx } from "~/server/audit/record";
import type { Tx } from "~/server/db";
import { comments, items, user } from "~/server/db/schema";
import { forbidden, notFound } from "~/server/errors";
import { AUDIT_ACTIONS } from "~/server/resources";

import { actorAudit, type ServiceContext } from "./context";
import type { UserRef } from "./item";
import { getItem } from "./item";
import { insertNotifications, viewersAmong } from "./notification";

export const COMMENT_MAX_LENGTH = 10_000;

export interface CommentView {
	id: number;
	/** 已删除的评论正文不下发 */
	body: string | null;
	author: UserRef;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
	canEdit: boolean;
	canDelete: boolean;
}

function excerpt(body: string): string {
	const flat = mentionsToPlain(body).replace(/\s+/g, " ").trim();
	return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

export async function listComments(
	ctx: ServiceContext,
	code: string,
): Promise<CommentView[]> {
	const { item } = await getItem(ctx, code);
	const rows = await ctx.db
		.select({
			id: comments.id,
			body: comments.body,
			authorId: comments.authorId,
			createdAt: comments.createdAt,
			updatedAt: comments.updatedAt,
			deletedAt: comments.deletedAt,
			author: { id: user.id, name: user.name, image: user.image },
		})
		.from(comments)
		.innerJoin(user, eq(user.id, comments.authorId))
		.where(eq(comments.itemId, item.id))
		.orderBy(asc(comments.id));
	return rows.map(({ authorId, ...r }) => ({
		...r,
		body: r.deletedAt ? null : r.body,
		canEdit: canEditComment(ctx.actor, { authorId, deletedAt: r.deletedAt }),
		canDelete: canDeleteComment(ctx.actor, {
			authorId,
			deletedAt: r.deletedAt,
		}),
	}));
}

/** 锁条目行：评论与条目的删除、状态变更串行 */
async function lockItemForComment(tx: Tx, ctx: ServiceContext, itemId: number) {
	const [row] = await tx
		.select()
		.from(items)
		.where(eq(items.id, itemId))
		.for("update");
	if (!row || !canView(ctx.actor, row)) throw notFound();
	return row;
}

/** 正文里 @ 的人：只认库里有、且看得见这张单的 */
async function mentionTargets(
	tx: Tx,
	item: { type: "ticket" | "todo"; reporterId: string },
	body: string,
): Promise<string[]> {
	const ids = parseMentions(body);
	if (ids.length === 0) return [];
	const existing = await tx
		.select({ id: user.id })
		.from(user)
		.where(inArray(user.id, ids));
	return viewersAmong(
		tx,
		item,
		existing.map((u) => u.id),
	);
}

export async function addComment(
	ctx: ServiceContext,
	code: string,
	body: string,
): Promise<{ id: number }> {
	const { item } = await getItem(ctx, code);
	return ctx.db.transaction(async (tx) => {
		const row = await lockItemForComment(tx, ctx, item.id);
		if (!canComment(ctx.actor, row))
			throw forbidden("不能在这张单上评论", {
				targetType: "item",
				targetId: String(row.id),
				targetName: row.code,
			});
		const mentions = await mentionTargets(tx, row, body);
		const [created] = await tx
			.insert(comments)
			.values({ itemId: row.id, authorId: ctx.actor.id, body, mentions })
			.returning({ id: comments.id });
		if (!created) throw new Error("写入评论失败");
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.commentCreate,
			targetType: "comment",
			targetId: String(created.id),
			targetName: row.code,
			...actorAudit(ctx),
		});
		await insertNotifications(
			tx,
			recipientsFor({
				kind: "commented",
				actorId: ctx.actor.id,
				item: row,
				mentionedIds: mentions,
			}),
			row,
			ctx.actor,
			{ excerpt: excerpt(body) },
		);
		return created;
	});
}

async function lockComment(tx: Tx, ctx: ServiceContext, id: number) {
	const [c] = await tx
		.select()
		.from(comments)
		.where(eq(comments.id, id))
		.for("update");
	if (!c) throw notFound("评论");
	const item = await lockItemForComment(tx, ctx, c.itemId);
	return { c, item };
}

export async function editComment(
	ctx: ServiceContext,
	id: number,
	body: string,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const { c, item } = await lockComment(tx, ctx, id);
		if (!canEditComment(ctx.actor, c))
			throw forbidden("只能改自己的评论", {
				targetType: "comment",
				targetId: String(id),
				targetName: item.code,
			});
		if (c.body === body) return;
		const mentions = await mentionTargets(tx, item, body);
		await tx
			.update(comments)
			.set({ body, mentions })
			.where(eq(comments.id, id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.commentUpdate,
			targetType: "comment",
			targetId: String(id),
			targetName: item.code,
			details: { changes: { body: { from: c.body, to: body } } },
			...actorAudit(ctx),
		});
		// 编辑只通知新加的 @
		const added = addedMentions(c.mentions, mentions).filter(
			(m) => m !== ctx.actor.id,
		);
		await insertNotifications(
			tx,
			added.map((recipientId) => ({ recipientId, kind: "mentioned" as const })),
			item,
			ctx.actor,
			{ excerpt: excerpt(body) },
		);
	});
}

export async function deleteComment(
	ctx: ServiceContext,
	id: number,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const { c, item } = await lockComment(tx, ctx, id);
		if (!canDeleteComment(ctx.actor, c))
			throw forbidden("只能删自己的评论", {
				targetType: "comment",
				targetId: String(id),
				targetName: item.code,
			});
		await tx
			.update(comments)
			.set({ deletedAt: new Date() })
			.where(eq(comments.id, id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.commentDelete,
			targetType: "comment",
			targetId: String(id),
			targetName: item.code,
			details: { changes: { body: { from: c.body, to: null } } },
			...actorAudit(ctx),
		});
	});
}
