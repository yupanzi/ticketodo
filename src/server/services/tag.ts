import { asc, eq, inArray, sql } from "drizzle-orm";

import { normalizeTagNames, type TagColor } from "~/domain/tag";
import { auditInTx } from "~/server/audit/record";
import type { Executor, Tx } from "~/server/db";
import { itemTags, tags } from "~/server/db/schema";
import { AppError, notFound } from "~/server/errors";
import { AUDIT_ACTIONS } from "~/server/resources";

import { actorAudit, type ServiceContext } from "./context";

export interface TagView {
	id: number;
	name: string;
	color: TagColor;
}

const tagColumns = { id: tags.id, name: tags.name, color: tags.color };

export async function listTags(db: Executor): Promise<TagView[]> {
	return db.select(tagColumns).from(tags).orderBy(asc(tags.name));
}

/**
 * 按名字取标签，没有的新建（大小写不敏感）。建单 / 编辑时内联用：谁都能新建标签，新建也进审计。
 * 返回按 id 排序，方便直接比较前后。
 */
export async function resolveTagNames(
	tx: Tx,
	ctx: ServiceContext,
	rawNames: readonly string[],
): Promise<TagView[]> {
	const names = normalizeTagNames(rawNames);
	if (names.length === 0) return [];
	const lowered = names.map((n) => n.toLowerCase());
	const existing = await tx
		.select(tagColumns)
		.from(tags)
		.where(inArray(sql`lower(${tags.name})`, lowered));
	const have = new Set(existing.map((t) => t.name.toLowerCase()));
	const out = [...existing];
	for (const name of names) {
		if (have.has(name.toLowerCase())) continue;
		// 并发新建同名标签：撞唯一索引就读回别人建的那个
		const [created] = await tx
			.insert(tags)
			.values({ name, createdBy: ctx.actor.id })
			.onConflictDoNothing()
			.returning(tagColumns);
		if (created) {
			await auditInTx(tx, {
				action: AUDIT_ACTIONS.tagCreate,
				targetType: "tag",
				targetId: String(created.id),
				targetName: created.name,
				...actorAudit(ctx),
			});
			out.push(created);
		} else {
			const [raced] = await tx
				.select(tagColumns)
				.from(tags)
				.where(eq(sql`lower(${tags.name})`, name.toLowerCase()));
			if (raced) out.push(raced);
		}
	}
	return out.sort((a, b) => a.id - b.id);
}

/** 条目当前的标签，按 id 排序（diff 按值比较） */
export async function itemTagsOf(
	db: Executor,
	itemIds: readonly number[],
): Promise<Map<number, TagView[]>> {
	const map = new Map<number, TagView[]>();
	if (itemIds.length === 0) return map;
	const rows = await db
		.select({ itemId: itemTags.itemId, ...tagColumns })
		.from(itemTags)
		.innerJoin(tags, eq(tags.id, itemTags.tagId))
		.where(inArray(itemTags.itemId, [...itemIds]))
		.orderBy(asc(tags.id));
	for (const { itemId, ...tag } of rows) {
		const list = map.get(itemId) ?? [];
		list.push(tag);
		map.set(itemId, list);
	}
	return map;
}

export async function setItemTags(
	tx: Tx,
	itemId: number,
	tagIds: readonly number[],
): Promise<void> {
	await tx.delete(itemTags).where(eq(itemTags.itemId, itemId));
	if (tagIds.length > 0)
		await tx
			.insert(itemTags)
			.values(tagIds.map((tagId) => ({ itemId, tagId })))
			.onConflictDoNothing();
}

// ---------- 管理员 ----------

async function lockTag(tx: Tx, id: number): Promise<TagView> {
	const [tag] = await tx
		.select(tagColumns)
		.from(tags)
		.where(eq(tags.id, id))
		.for("update");
	if (!tag) throw notFound("标签");
	return tag;
}

export async function updateTag(
	ctx: ServiceContext,
	id: number,
	patch: { name?: string; color?: TagColor },
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const before = await lockTag(tx, id);
		const name = patch.name ? normalizeTagNames([patch.name])[0] : undefined;
		const next = {
			name: name ?? before.name,
			color: patch.color ?? before.color,
		};
		if (next.name === before.name && next.color === before.color) return;
		const [clash] = await tx
			.select({ id: tags.id })
			.from(tags)
			.where(eq(sql`lower(${tags.name})`, next.name.toLowerCase()));
		if (clash && clash.id !== id)
			throw new AppError(
				"CONFLICT",
				`已有同名标签「${next.name}」，要合并请用合并`,
			);
		await tx.update(tags).set(next).where(eq(tags.id, id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.tagUpdate,
			targetType: "tag",
			targetId: String(id),
			targetName: next.name,
			details: {
				changes: {
					...(next.name !== before.name
						? { name: { from: before.name, to: next.name } }
						: {}),
					...(next.color !== before.color
						? { color: { from: before.color, to: next.color } }
						: {}),
				},
			},
			...actorAudit(ctx),
		});
	});
}

/** 把 source 并入 target：条目上的 source 换成 target（已有 target 的跳过），然后删 source */
export async function mergeTag(
	ctx: ServiceContext,
	sourceId: number,
	targetId: number,
): Promise<void> {
	if (sourceId === targetId)
		throw new AppError("BAD_REQUEST", "不能把标签合并到它自己");
	await ctx.db.transaction(async (tx) => {
		const source = await lockTag(tx, sourceId);
		const target = await lockTag(tx, targetId);
		const moved = await tx.execute(sql`
			INSERT INTO ${itemTags} (item_id, tag_id)
			SELECT item_id, ${targetId} FROM ${itemTags} WHERE tag_id = ${sourceId}
			ON CONFLICT DO NOTHING`);
		await tx.delete(tags).where(eq(tags.id, sourceId));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.tagMerge,
			targetType: "tag",
			targetId: String(targetId),
			targetName: target.name,
			details: {
				summary: `「${source.name}」并入「${target.name}」`,
				counts: { items: moved.rowCount ?? 0 },
			},
			...actorAudit(ctx),
		});
	});
}

export async function deleteTag(
	ctx: ServiceContext,
	id: number,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const tag = await lockTag(tx, id);
		const removed = await tx
			.delete(itemTags)
			.where(eq(itemTags.tagId, id))
			.returning({ itemId: itemTags.itemId });
		await tx.delete(tags).where(eq(tags.id, id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.tagDelete,
			targetType: "tag",
			targetId: String(id),
			targetName: tag.name,
			details: { counts: { items: removed.length } },
			...actorAudit(ctx),
		});
	});
}
