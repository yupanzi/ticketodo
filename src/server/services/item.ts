import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	not,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";

import type { AuditChanges } from "~/domain/audit";
import { diffFields, hasChanges } from "~/domain/diff";
import { APP_TIMEZONE } from "~/domain/due";
import {
	ACTIVE_STATUSES,
	type ItemStatus,
	type ItemType,
	STATUS_LABEL,
} from "~/domain/item";
import { parseItemCode } from "~/domain/item-code";
import {
	type BoardScope,
	DEFAULT_SORT,
	type DueFilter,
	type ItemSort,
	type SortDir,
} from "~/domain/item-list";
import { recipientsFor } from "~/domain/notify";
import {
	canAssign,
	canConvert,
	canDelete,
	canEdit,
	canPlan,
	canRestore,
	canTransition,
	canView,
	type ItemPermissions,
	isAdmin,
	itemPermissions,
} from "~/domain/policy";
import {
	type Priority,
	type PriorityFilter,
	UNTRIAGED,
} from "~/domain/priority";
import type { ScheduleScope } from "~/domain/schedule";
import { findEdge, statusTimestamps } from "~/domain/status";
import { auditInTx } from "~/server/audit/record";
import type { Executor, Tx } from "~/server/db";
import { auditLogs, items, itemTags, user } from "~/server/db/schema";
import { AppError, forbidden, notFound } from "~/server/errors";
import { AUDIT_ACTIONS } from "~/server/resources";

import { actorAudit, type ServiceContext } from "./context";
import { nextItemCode } from "./item-code";
import { insertNotifications } from "./notification";
import { itemTagsOf, resolveTagNames, setItemTags, type TagView } from "./tag";
import { visibleItemsWhere } from "./visibility";

// ---------- 读 ----------

export interface UserRef {
	id: string;
	name: string;
	image: string | null;
}

export interface ItemView {
	id: number;
	code: string;
	type: ItemType;
	title: string;
	description: string;
	/** null = 待定级 */
	priority: Priority | null;
	status: ItemStatus;
	dueDate: string | null;
	/** 计划开始日期（接收方排期） */
	startDate: string | null;
	createdAt: Date;
	updatedAt: Date;
	resolvedAt: Date | null;
	closedAt: Date | null;
	convertedAt: Date | null;
	deletedAt: Date | null;
	reporter: UserRef;
	assignee: UserRef;
	tags: TagView[];
}

const reporter = alias(user, "reporter");
const assignee = alias(user, "assignee");

const itemColumns = {
	id: items.id,
	code: items.code,
	type: items.type,
	title: items.title,
	description: items.description,
	priority: items.priority,
	status: items.status,
	dueDate: items.dueDate,
	startDate: items.startDate,
	createdAt: items.createdAt,
	updatedAt: items.updatedAt,
	resolvedAt: items.resolvedAt,
	closedAt: items.closedAt,
	convertedAt: items.convertedAt,
	deletedAt: items.deletedAt,
	reporter: { id: reporter.id, name: reporter.name, image: reporter.image },
	assignee: { id: assignee.id, name: assignee.name, image: assignee.image },
};

function selectItems(db: Executor) {
	return db
		.select(itemColumns)
		.from(items)
		.innerJoin(reporter, eq(reporter.id, items.reporterId))
		.innerJoin(assignee, eq(assignee.id, items.assigneeId));
}

async function withTags(
	db: Executor,
	rows: Omit<ItemView, "tags">[],
): Promise<ItemView[]> {
	const tagMap = await itemTagsOf(
		db,
		rows.map((r) => r.id),
	);
	return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

function refOf(
	row: Pick<
		ItemView,
		"type" | "status" | "deletedAt" | "reporter" | "assignee"
	>,
) {
	return {
		type: row.type,
		status: row.status,
		deletedAt: row.deletedAt,
		reporterId: row.reporter.id,
		assigneeId: row.assignee.id,
	};
}

/** 详情：看不见的与不存在的同样是 NOT_FOUND */
export async function getItem(
	ctx: ServiceContext,
	code: string,
): Promise<{ item: ItemView; permissions: ItemPermissions }> {
	if (!parseItemCode(code)) throw notFound();
	const [row] = await selectItems(ctx.db).where(
		eq(items.code, code.toUpperCase()),
	);
	if (!row || !canView(ctx.actor, refOf(row))) throw notFound();
	const [item] = await withTags(ctx.db, [row]);
	if (!item) throw notFound();
	return { item, permissions: itemPermissions(ctx.actor, refOf(row)) };
}

const todaySql = sql`(now() AT TIME ZONE ${APP_TIMEZONE})::date`;

export interface ListFilters {
	types?: ItemType[];
	statuses?: ItemStatus[];
	/** 含 `untriaged`（待定级） */
	priorities?: PriorityFilter[];
	assigneeIds?: string[];
	reporterIds?: string[];
	/** 命中任一标签 */
	tagIds?: number[];
	due?: DueFilter;
	q?: string;
	sort?: ItemSort;
	/** 上一页最后一条的 id */
	cursor?: number;
	limit: number;
}

function dueWhere(due: DueFilter): SQL | undefined {
	const active = inArray(items.status, [...ACTIVE_STATUSES]);
	if (due === "overdue") return and(lt(items.dueDate, todaySql), active);
	if (due === "today") return and(eq(items.dueDate, todaySql), active);
	if (due === "next7")
		return and(
			gte(items.dueDate, todaySql),
			lte(items.dueDate, sql`${todaySql} + 6`),
			active,
		);
	if (due === "none") return isNull(items.dueDate);
	return and(
		due.from ? gte(items.dueDate, due.from) : undefined,
		due.to ? lte(items.dueDate, due.to) : undefined,
	);
}

interface SortKey {
	expr: SQL | AnyPgColumn;
	dir: SortDir;
}

/**
 * 优先级的排序值：待定级当作比 P0 还靠前（空串 < 'P0'），升序最先、降序最后。⚠️ 别直接用可空的
 * 列：keyset 的 `=` / `>` 碰到 NULL 得 NULL，翻页会漏行。P 级的字典序与枚举序一致。
 */
const priorityRank = sql`coalesce(${items.priority}::text, '')`;

/**
 * 排序键，末位总是 id：键值唯一，keyset 分页才不会在并列处漏行或重复。
 * 没设期望完成的不论升降都排最后：升序当作 infinity，降序当作 -infinity。
 */
function sortKeys({ by, dir }: ItemSort): SortKey[] {
	const due = (d: SortDir): SortKey => ({
		expr: sql`coalesce(${items.dueDate}, ${d === "asc" ? "infinity" : "-infinity"}::date)`,
		dir: d,
	});
	switch (by) {
		case "priority":
			return [
				{ expr: priorityRank, dir },
				due("asc"),
				{ expr: items.id, dir: "desc" },
			];
		case "due":
			return [
				due(dir),
				{ expr: priorityRank, dir: "asc" },
				{ expr: items.id, dir: "desc" },
			];
		case "updated":
			return [
				{ expr: items.updatedAt, dir },
				{ expr: items.id, dir },
			];
		case "created":
			return [{ expr: items.id, dir }];
	}
}

const orderOf = (keys: SortKey[]) =>
	keys.map((k) => (k.dir === "asc" ? asc(k.expr) : desc(k.expr)));

/**
 * keyset：排在游标那一行之后的行。游标只是 id，排序值现查：updated_at 是微秒，经 JS Date 倒一手
 * 会截成毫秒、漏行；取成 text 再当参数比较则原样。游标行看不见就当不存在（返回 null → 空页），
 * 否则能借翻页位置推出别人 todo 的优先级与日期。
 */
async function afterCursor(
	ctx: ServiceContext,
	keys: SortKey[],
	cursor: number,
): Promise<SQL | null> {
	const [row] = await ctx.db
		.select(
			Object.fromEntries(
				keys.map((k, i) => [`k${i}`, sql<string>`(${k.expr})::text`]),
			),
		)
		.from(items)
		.where(and(eq(items.id, cursor), visibleItemsWhere(ctx.actor)));
	if (!row) return null;
	const values = keys.map((_, i) => row[`k${i}`]);
	// (k0 ⋗ v0) OR (k0 = v0 AND k1 ⋗ v1) OR …，⋗ 按各键方向取 > 或 <
	return or(
		...keys.map((k, i) =>
			and(
				...keys.slice(0, i).map((p, j) => sql`${p.expr} = ${values[j]}`),
				k.dir === "asc"
					? sql`${k.expr} > ${values[i]}`
					: sql`${k.expr} < ${values[i]}`,
			),
		),
	) as SQL;
}

export async function listItems(
	ctx: ServiceContext,
	f: ListFilters,
): Promise<{ items: ItemView[]; nextCursor: number | null }> {
	const conds: (SQL | undefined)[] = [visibleItemsWhere(ctx.actor)];
	if (f.types?.length) conds.push(inArray(items.type, f.types));
	if (f.statuses?.length) conds.push(inArray(items.status, f.statuses));
	if (f.priorities?.length) {
		const ps = f.priorities.filter((p): p is Priority => p !== UNTRIAGED);
		conds.push(
			or(
				ps.length ? inArray(items.priority, ps) : undefined,
				f.priorities.includes(UNTRIAGED) ? isNull(items.priority) : undefined,
			),
		);
	}
	if (f.assigneeIds?.length)
		conds.push(inArray(items.assigneeId, f.assigneeIds));
	if (f.reporterIds?.length)
		conds.push(inArray(items.reporterId, f.reporterIds));
	if (f.tagIds?.length)
		conds.push(
			inArray(
				items.id,
				ctx.db
					.select({ id: itemTags.itemId })
					.from(itemTags)
					.where(inArray(itemTags.tagId, f.tagIds)),
			),
		);
	if (f.due) conds.push(dueWhere(f.due));
	const q = f.q?.trim();
	if (q) {
		// 单号精确找；标题模糊找（% 与 _ 当普通字符）
		const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
		conds.push(
			or(eq(items.code, q.toUpperCase()), ilike(items.title, `%${escaped}%`)),
		);
	}
	const keys = sortKeys(f.sort ?? DEFAULT_SORT);
	if (f.cursor) {
		const after = await afterCursor(ctx, keys, f.cursor);
		if (!after) return { items: [], nextCursor: null };
		conds.push(after);
	}

	const rows = await selectItems(ctx.db)
		.where(and(...conds))
		.orderBy(...orderOf(keys))
		.limit(f.limit + 1);
	const page = rows.slice(0, f.limit);
	return {
		items: await withTags(ctx.db, page),
		nextCursor: rows.length > f.limit ? (page.at(-1)?.id ?? null) : null,
	};
}

export interface MySummary {
	/** 我负责、进行中、已过期望完成日期 */
	overdue: number;
	/** 我负责、进行中、今天到期 */
	dueToday: number;
	/** 我提的 ticket，负责人标了已解决、等我确认关闭 */
	awaitingConfirmation: number;
	/** 我负责、进行中 */
	active: number;
}

/** 首页「今日概览」：一条 SQL 用 FILTER 算齐四个数；到期两项直接用列表的 `dueWhere`，口径不分叉 */
export async function mySummary(ctx: ServiceContext): Promise<MySummary> {
	const me = ctx.actor.id;
	const mine = eq(items.assigneeId, me);
	const count = (...conds: (SQL | undefined)[]) =>
		sql<number>`count(*) FILTER (WHERE ${and(...conds)})`.mapWith(Number);
	const [row] = await ctx.db
		.select({
			overdue: count(mine, dueWhere("overdue")),
			dueToday: count(mine, dueWhere("today")),
			awaitingConfirmation: count(
				sql`${items.reporterId} = ${me} AND ${items.type} = 'ticket' AND ${items.status} = 'resolved'`,
			),
			active: count(mine, inArray(items.status, [...ACTIVE_STATUSES])),
		})
		.from(items)
		.where(visibleItemsWhere(ctx.actor));
	return row ?? { overdue: 0, dueToday: 0, awaitingConfirmation: 0, active: 0 };
}

/** 看板上限：四象限一屏，再多就该去列表筛了 */
const BOARD_LIMIT = 500;

/**
 * 按人分的视角，都不看已关闭的（看板、日历、甘特共用）：
 * - assigned：我负责的 · reported：我提的 ticket · all：看得见的全部
 */
function peopleScopeWhere(me: string, scope: ScheduleScope): SQL | undefined {
	const open = not(eq(items.status, "closed"));
	if (scope === "assigned") return and(open, eq(items.assigneeId, me));
	if (scope === "reported")
		return and(open, eq(items.reporterId, me), eq(items.type, "ticket"));
	return open;
}

/**
 * 四象限看板（UI 按 priority 分格）。reported / all 见 `peopleScopeWhere`；
 * mine 是「需要我处理的」：我负责的进行中条目，加上我提的、等我确认的已解决 ticket。
 */
export async function boardItems(
	ctx: ServiceContext,
	scope: BoardScope,
): Promise<ItemView[]> {
	const me = ctx.actor.id;
	const scopeCond =
		scope === "mine"
			? or(
					and(
						eq(items.assigneeId, me),
						inArray(items.status, [...ACTIVE_STATUSES]),
					),
					and(
						eq(items.reporterId, me),
						eq(items.type, "ticket"),
						eq(items.status, "resolved"),
					),
				)
			: peopleScopeWhere(me, scope);
	const rows = await selectItems(ctx.db)
		.where(and(visibleItemsWhere(ctx.actor), scopeCond))
		// 与列表默认排序同一套键：象限内优先级相同，即期望完成近的在前、没设的在后
		.orderBy(...orderOf(sortKeys(DEFAULT_SORT)))
		.limit(BOARD_LIMIT);
	return withTags(ctx.db, rows);
}

/** 日历、甘特一次最多回多少条：一屏画不下更多，再多就该去列表筛了 */
const SCHEDULE_LIMIT = 300;

/**
 * 日历、甘特只画这几样：不联人、不带标签，更不带描述。一屏几百条、还要预取前后两屏，
 * 整条记录会让每次翻页多下几百 KB。
 */
const scheduleColumns = {
	code: items.code,
	title: items.title,
	priority: items.priority,
	status: items.status,
	dueDate: items.dueDate,
	startDate: items.startDate,
};
type ScheduleInput = { from: string; to: string; scope: ScheduleScope };

const scheduleWhere = (ctx: ServiceContext, scope: ScheduleScope) =>
	and(visibleItemsWhere(ctx.actor), peopleScopeWhere(ctx.actor.id, scope));

/** 日历：期望完成落在 [from, to] 的单（起止含当天） */
export async function calendarItems(ctx: ServiceContext, input: ScheduleInput) {
	return (
		ctx.db
			.select(scheduleColumns)
			.from(items)
			.where(
				and(
					scheduleWhere(ctx, input.scope),
					gte(items.dueDate, input.from),
					lte(items.dueDate, input.to),
				),
			)
			// 同一天里与列表默认排序一致：待定级与 P0 在前
			.orderBy(asc(items.dueDate), ...orderOf(sortKeys(DEFAULT_SORT)))
			.limit(SCHEDULE_LIMIT)
	);
}

/**
 * 甘特条的起点：计划开始，没排就从建单那天（北京日期）算。原样回给前端画（`ganttSpan`），
 * 筛窗口与画条用的是同一个表达式。
 */
const spanStartSql = sql<string>`coalesce(${items.startDate}, (${items.createdAt} AT TIME ZONE ${APP_TIMEZONE})::date)`;

/**
 * 甘特：有期望完成、且 [起点, 期望完成] 与 [from, to] 有交集的单。起点晚于期望完成（排不过来）时按
 * 两者之间算，图上标红。
 */
export async function ganttItems(ctx: ServiceContext, input: ScheduleInput) {
	const lo = sql`least(${spanStartSql}, ${items.dueDate})`;
	const hi = sql`greatest(${spanStartSql}, ${items.dueDate})`;
	return ctx.db
		.select({
			...scheduleColumns,
			spanStart: sql<string>`(${spanStartSql})::text`,
		})
		.from(items)
		.where(
			and(
				scheduleWhere(ctx, input.scope),
				isNotNull(items.dueDate),
				sql`${lo} <= ${input.to}`,
				sql`${hi} >= ${input.from}`,
			),
		)
		.orderBy(asc(lo), asc(items.dueDate), desc(items.id))
		.limit(SCHEDULE_LIMIT);
}

/** 管理员回收站 */
export async function trashItems(ctx: ServiceContext): Promise<ItemView[]> {
	if (!isAdmin(ctx.actor)) throw forbidden("只有管理员能看已删单子");
	const rows = await selectItems(ctx.db)
		.where(isNotNull(items.deletedAt))
		.orderBy(desc(items.deletedAt))
		.limit(200);
	return withTags(ctx.db, rows);
}

export interface TimelineEvent {
	id: number;
	at: Date;
	action: string;
	actorName: string | null;
	/** 经 API key 的操作（名称）；null = 浏览器 */
	apiKeyName: string | null;
	summary: string | null;
	changes: AuditChanges | null;
}

/**
 * 时间线 = 该条目的成功审计。⚠️ 只选白名单列：ip、user_agent、request_id、api_key_id 只给管理员在
 * 审计页看（key 名称给大家看：同事要分得清哪些是 AI 代做的）。
 * 评论的审计不进来（评论本身就在流里，改过 / 删了的正文不能借审计漏给旁人）。
 * todo 转 ticket 之前的记录那时是私人的，非管理员看不到。
 */
export async function timeline(
	ctx: ServiceContext,
	code: string,
): Promise<TimelineEvent[]> {
	const { item } = await getItem(ctx, code);
	const since =
		item.convertedAt && !isAdmin(ctx.actor)
			? gte(auditLogs.at, item.convertedAt)
			: undefined;
	const rows = await ctx.db
		.select({
			id: auditLogs.id,
			at: auditLogs.at,
			action: auditLogs.action,
			actorName: auditLogs.actorName,
			apiKeyName: auditLogs.apiKeyName,
			details: auditLogs.details,
		})
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.targetType, "item"),
				eq(auditLogs.targetId, String(item.id)),
				eq(auditLogs.status, "success"),
				not(like(auditLogs.action, "comment.%")),
				since,
			),
		)
		.orderBy(asc(auditLogs.id));
	return rows.map(({ details, ...r }) => ({
		...r,
		summary: details?.summary ?? null,
		changes: details?.changes ?? null,
	}));
}

// ---------- 写 ----------

type ItemRow = typeof items.$inferSelect;

/** 写操作的第一步：锁行，再判可见性。看不见的一律 NOT_FOUND */
async function lockVisible(
	tx: Tx,
	ctx: ServiceContext,
	code: string,
): Promise<ItemRow> {
	if (!parseItemCode(code)) throw notFound();
	const [row] = await tx
		.select()
		.from(items)
		.where(eq(items.code, code.toUpperCase()))
		.for("update");
	if (!row || !canView(ctx.actor, row)) throw notFound();
	return row;
}

function target(row: Pick<ItemRow, "id" | "code">) {
	return { targetType: "item", targetId: String(row.id), targetName: row.code };
}

async function userRef(db: Executor, id: string): Promise<UserRef | undefined> {
	const [u] = await db
		.select({ id: user.id, name: user.name, image: user.image })
		.from(user)
		.where(eq(user.id, id));
	return u;
}

/** 只能指派给登录过的人（在 user 表里） */
async function requireUser(db: Executor, id: string): Promise<UserRef> {
	const u = await userRef(db, id);
	if (!u)
		throw new AppError("BAD_REQUEST", "指派的人不存在（只能指派给登录过的人）");
	return u;
}

export interface CreateItemInput {
	type: ItemType;
	title: string;
	description: string;
	/** todo 必填；ticket 忽略：建单是待定级，由负责人定（`canPlan`） */
	priority?: Priority;
	dueDate: string | null;
	/** 计划开始：同 priority，只有 todo 建单时带 */
	startDate?: string | null;
	/** ticket 必填；todo 忽略（恒为本人） */
	assigneeId?: string;
	tags: string[];
}

export async function createItem(
	ctx: ServiceContext,
	input: CreateItemInput,
): Promise<{ code: string }> {
	return ctx.db.transaction(async (tx) => {
		const isTicket = input.type === "ticket";
		if (isTicket && !input.assigneeId)
			throw new AppError("BAD_REQUEST", "ticket 必须指定负责人");
		if (!isTicket && !input.priority)
			throw new AppError("BAD_REQUEST", "todo 要选优先级");
		const priority = isTicket ? null : (input.priority ?? null);
		const startDate = isTicket ? null : (input.startDate ?? null);
		const assigneeId = isTicket ? (input.assigneeId as string) : ctx.actor.id;
		const assigneeUser = await requireUser(tx, assigneeId);

		const code = await nextItemCode(tx);
		const [row] = await tx
			.insert(items)
			.values({
				code,
				type: input.type,
				title: input.title,
				description: input.description,
				priority,
				dueDate: input.dueDate,
				startDate,
				reporterId: ctx.actor.id,
				assigneeId,
			})
			.returning();
		if (!row) throw new Error("建单失败");
		const tagList = await resolveTagNames(tx, ctx, input.tags);
		await setItemTags(
			tx,
			row.id,
			tagList.map((t) => t.id),
		);

		await auditInTx(tx, {
			action: AUDIT_ACTIONS.itemCreate,
			...target(row),
			details: {
				summary: `创建${isTicket ? " Ticket" : " Todo"}`,
				changes: {
					title: { from: null, to: row.title },
					...(row.priority
						? { priority: { from: null, to: row.priority } }
						: {}),
					...(isTicket
						? {
								assignee: {
									from: null,
									to: { id: assigneeUser.id, name: assigneeUser.name },
								},
							}
						: {}),
					...(row.dueDate ? { dueDate: { from: null, to: row.dueDate } } : {}),
					...(row.startDate
						? { startDate: { from: null, to: row.startDate } }
						: {}),
					...(tagList.length
						? {
								tags: {
									from: [],
									to: tagList.map(({ id, name }) => ({ id, name })),
								},
							}
						: {}),
				},
			},
			...actorAudit(ctx),
		});
		await insertNotifications(
			tx,
			recipientsFor({ kind: "assigned", actorId: ctx.actor.id, item: row }),
			row,
			ctx.actor,
		);
		return { code };
	});
}

export interface UpdateItemInput {
	title?: string;
	description?: string;
	priority?: Priority;
	dueDate?: string | null;
	startDate?: string | null;
	tags?: string[];
	/** 编辑表单打开时的版本；别人先改了就 CONFLICT，不覆盖 */
	expectedUpdatedAt?: Date;
}

const EDITABLE = [
	"title",
	"description",
	"priority",
	"dueDate",
	"startDate",
	"tags",
] as const;

export async function updateItem(
	ctx: ServiceContext,
	code: string,
	input: UpdateItemInput,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, code);
		if (!canEdit(ctx.actor, row))
			throw forbidden("你不能编辑这张单", target(row));
		if (
			input.expectedUpdatedAt &&
			input.expectedUpdatedAt.getTime() !== row.updatedAt.getTime()
		)
			throw new AppError("CONFLICT", "这张单刚被别人改过，请刷新后再改");

		const beforeTags = (await itemTagsOf(tx, [row.id])).get(row.id) ?? [];
		const afterTags =
			input.tags === undefined
				? undefined
				: await resolveTagNames(tx, ctx, input.tags);
		const snapshot = (tags: TagView[]) =>
			tags.map(({ id, name }) => ({ id, name }));
		const changes = diffFields(
			{
				title: row.title,
				description: row.description,
				priority: row.priority,
				dueDate: row.dueDate,
				startDate: row.startDate,
				tags: snapshot(beforeTags),
			},
			{
				...(input.title !== undefined ? { title: input.title } : {}),
				...(input.description !== undefined
					? { description: input.description }
					: {}),
				...(input.priority !== undefined ? { priority: input.priority } : {}),
				...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
				...(input.startDate !== undefined
					? { startDate: input.startDate }
					: {}),
				...(afterTags ? { tags: snapshot(afterTags) } : {}),
			},
			EDITABLE,
		);
		if (!hasChanges(changes)) return;
		// 只在真改了时判：编辑表单会把原值一起带上
		if ((changes.priority || changes.startDate) && !canPlan(ctx.actor, row))
			throw forbidden("优先级与计划开始由负责人定", target(row));

		// 只改变了的列；只动了标签也要刷新 updatedAt（编辑冲突检测靠它）
		const columns: Partial<typeof items.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (changes.title && input.title !== undefined) columns.title = input.title;
		if (changes.description && input.description !== undefined)
			columns.description = input.description;
		if (changes.priority && input.priority) columns.priority = input.priority;
		if (changes.dueDate && input.dueDate !== undefined)
			columns.dueDate = input.dueDate;
		if (changes.startDate && input.startDate !== undefined)
			columns.startDate = input.startDate;
		await tx.update(items).set(columns).where(eq(items.id, row.id));
		if (afterTags && changes.tags)
			await setItemTags(
				tx,
				row.id,
				afterTags.map((t) => t.id),
			);

		await auditInTx(tx, {
			action: AUDIT_ACTIONS.itemUpdate,
			...target(row),
			details: { changes },
			...actorAudit(ctx),
		});
	});
}

export async function transitionItem(
	ctx: ServiceContext,
	code: string,
	to: ItemStatus,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, code);
		if (row.status === to) return;
		if (!canTransition(ctx.actor, row, to))
			throw forbidden(
				`你不能把这张单从「${STATUS_LABEL[row.status]}」改为「${STATUS_LABEL[to]}」`,
				target(row),
			);
		const edge = findEdge(row.type, row.status, to);
		await tx
			.update(items)
			.set({ status: to, ...statusTimestamps(row.status, to, new Date()) })
			.where(eq(items.id, row.id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.itemStatus,
			...target(row),
			details: {
				summary: edge?.label,
				changes: { status: { from: row.status, to } },
			},
			...actorAudit(ctx),
		});
		await insertNotifications(
			tx,
			recipientsFor({
				kind: "status_changed",
				actorId: ctx.actor.id,
				item: row,
			}),
			row,
			ctx.actor,
			{ status: { from: row.status, to } },
		);
	});
}

/** 改派：只有当前负责人或管理员；状态不变 */
export async function assignItem(
	ctx: ServiceContext,
	code: string,
	assigneeId: string,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, code);
		if (!canAssign(ctx.actor, row))
			throw forbidden("只有当前负责人或管理员能转派这张单", target(row));
		if (row.assigneeId === assigneeId) return;
		const from = await userRef(tx, row.assigneeId);
		const to = await requireUser(tx, assigneeId);
		await tx.update(items).set({ assigneeId }).where(eq(items.id, row.id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.itemAssign,
			...target(row),
			details: {
				changes: {
					assignee: {
						from: from
							? { id: from.id, name: from.name }
							: { id: row.assigneeId },
						to: { id: to.id, name: to.name },
					},
				},
			},
			...actorAudit(ctx),
		});
		await insertNotifications(
			tx,
			recipientsFor({
				kind: "assigned",
				actorId: ctx.actor.id,
				item: { ...row, assigneeId },
			}),
			row,
			ctx.actor,
		);
	});
}

/** todo → ticket：要指定负责人；单号不变；此前的时间线对非管理员隐藏 */
export async function convertItem(
	ctx: ServiceContext,
	code: string,
	assigneeId: string,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, code);
		if (!canConvert(ctx.actor, row))
			throw forbidden(
				"只有本人或管理员能把未关闭的 todo 转成 ticket",
				target(row),
			);
		const to = await requireUser(tx, assigneeId);
		// 交给别人就由对方重新定级（原优先级是提单人自己定的）；转给自己则照旧
		const untriage = assigneeId !== row.reporterId && row.priority !== null;
		await tx
			.update(items)
			// ⚠️ 取库的 now()（事务开始时间），与这笔转换审计的 at 相等：时间线按 at >= convertedAt
			// 截断，用应用时钟会比审计晚几毫秒，把「转换」这条自己也截掉
			.set({
				type: "ticket",
				assigneeId,
				convertedAt: sql`now()`,
				...(untriage ? { priority: null } : {}),
			})
			.where(eq(items.id, row.id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.itemConvert,
			...target(row),
			details: {
				summary: "Todo 转为 Ticket",
				changes: {
					type: { from: "todo", to: "ticket" },
					assignee: { from: null, to: { id: to.id, name: to.name } },
					...(untriage ? { priority: { from: row.priority, to: null } } : {}),
				},
			},
			...actorAudit(ctx),
		});
		await insertNotifications(
			tx,
			recipientsFor({
				kind: "assigned",
				actorId: ctx.actor.id,
				item: { type: "ticket", reporterId: row.reporterId, assigneeId },
			}),
			{ ...row, type: "ticket" },
			ctx.actor,
		);
	});
}

export async function deleteItem(
	ctx: ServiceContext,
	code: string,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, code);
		if (!canDelete(ctx.actor, row))
			throw forbidden("只有提单人或管理员能删除这张单", target(row));
		await tx
			.update(items)
			.set({ deletedAt: new Date(), deletedBy: ctx.actor.id })
			.where(eq(items.id, row.id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.itemDelete,
			...target(row),
			details: { summary: row.title },
			...actorAudit(ctx),
		});
	});
}

export async function restoreItem(
	ctx: ServiceContext,
	code: string,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const row = await lockVisible(tx, ctx, code);
		if (!canRestore(ctx.actor, row))
			throw forbidden("只有管理员能恢复已删的单", target(row));
		await tx
			.update(items)
			.set({ deletedAt: null, deletedBy: null })
			.where(eq(items.id, row.id));
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.itemRestore,
			...target(row),
			details: { summary: row.title },
			...actorAudit(ctx),
		});
	});
}
