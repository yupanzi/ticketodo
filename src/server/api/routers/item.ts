import { z } from "zod";
import { daysBetween } from "~/domain/due";
import {
	DESCRIPTION_MAX_LENGTH,
	ITEM_STATUSES,
	ITEM_TYPES,
	TITLE_MAX_LENGTH,
} from "~/domain/item";
import {
	BOARD_SCOPES,
	DUE_PRESETS,
	ITEM_SORTS,
	SORT_DIRS,
} from "~/domain/item-list";
import { PRIORITIES, PRIORITY_FILTERS } from "~/domain/priority";
import { SCHEDULE_MAX_DAYS, SCHEDULE_SCOPES } from "~/domain/schedule";
import { TAG_NAME_MAX_LENGTH } from "~/domain/tag";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { AUDIT_ACTIONS } from "~/server/resources";
import {
	assignItem,
	boardItems,
	calendarItems,
	convertItem,
	createItem,
	deleteItem,
	ganttItems,
	getItem,
	listItems,
	mySummary,
	restoreItem,
	timeline,
	transitionItem,
	trashItems,
	updateItem,
} from "~/server/services/item";

const code = z.string().trim().min(1).max(32);
const userId = z.string().min(1).max(64);
const title = z.string().trim().min(1, "标题不能为空").max(TITLE_MAX_LENGTH);
const description = z.string().max(DESCRIPTION_MAX_LENGTH);
/** `YYYY-MM-DD` 或 null（不设） */
const nullableDay = z.iso.date().nullable();
const tagNames = z.array(z.string().max(TAG_NAME_MAX_LENGTH)).max(10);

/** 日历、甘特的区间：起止含当天，最多 `SCHEDULE_MAX_DAYS` 天（一屏画不下更多） */
const scheduleRange = z
	.object({
		from: z.iso.date(),
		to: z.iso.date(),
		scope: z.enum(SCHEDULE_SCOPES),
	})
	.refine((r) => {
		const n = daysBetween(r.from, r.to);
		return n >= 0 && n < SCHEDULE_MAX_DAYS;
	}, `起止要有序，最多 ${SCHEDULE_MAX_DAYS} 天`);

/**
 * 改单的 mutation 都回最新详情（与 byCode 同形）：客户端拿它当场更新详情页，不用改完再查一趟。
 * 服务端多一次查库是毫秒级，省下的是一个网络往返。
 */
const detailAfter = async (
	svc: Parameters<typeof getItem>[0],
	code: string,
	write: Promise<unknown>,
) => {
	await write;
	return getItem(svc, code);
};

const createFields = {
	title,
	description: description.default(""),
	dueDate: nullableDay.default(null),
	tags: tagNames.default([]),
};

export const itemRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemCreate })
		.input(
			z.discriminatedUnion("type", [
				// ticket 必须指定负责人：不存在未指派的单。不收优先级：建单是待定级，由负责人定
				z.object({
					type: z.literal("ticket"),
					assigneeId: userId,
					...createFields,
				}),
				z.object({
					type: z.literal("todo"),
					priority: z.enum(PRIORITIES),
					startDate: nullableDay.default(null),
					...createFields,
				}),
			]),
		)
		// 只回单号：前端接着跳详情页，那边服务端渲染时自己取（不用 detailAfter）
		.mutation(({ ctx, input }) => createItem(ctx.svc, input)),

	byCode: protectedProcedure
		.input(z.object({ code }))
		.query(({ ctx, input }) => getItem(ctx.svc, input.code)),

	list: protectedProcedure
		.input(
			z.object({
				types: z.array(z.enum(ITEM_TYPES)).optional(),
				statuses: z.array(z.enum(ITEM_STATUSES)).optional(),
				priorities: z.array(z.enum(PRIORITY_FILTERS)).optional(),
				assigneeIds: z.array(userId).max(50).optional(),
				reporterIds: z.array(userId).max(50).optional(),
				tagIds: z.array(z.number().int().positive()).max(50).optional(),
				due: z
					.union([
						z.enum(DUE_PRESETS),
						z
							.object({
								from: z.iso.date().optional(),
								to: z.iso.date().optional(),
							})
							.refine((r) => r.from || r.to, "起止日期至少给一个"),
					])
					.optional(),
				q: z.string().max(100).optional(),
				sort: z
					.object({ by: z.enum(ITEM_SORTS), dir: z.enum(SORT_DIRS) })
					.optional(),
				cursor: z.number().int().positive().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.query(({ ctx, input }) => listItems(ctx.svc, input)),

	summary: protectedProcedure.query(({ ctx }) => mySummary(ctx.svc)),

	board: protectedProcedure
		.input(z.object({ scope: z.enum(BOARD_SCOPES) }))
		.query(({ ctx, input }) => boardItems(ctx.svc, input.scope)),

	calendar: protectedProcedure
		.input(scheduleRange)
		.query(({ ctx, input }) => calendarItems(ctx.svc, input)),

	gantt: protectedProcedure
		.input(scheduleRange)
		.query(({ ctx, input }) => ganttItems(ctx.svc, input)),

	timeline: protectedProcedure
		.input(z.object({ code }))
		.query(({ ctx, input }) => timeline(ctx.svc, input.code)),

	update: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemUpdate })
		.input(
			z.object({
				code,
				expectedUpdatedAt: z.date().optional(),
				title: title.optional(),
				description: description.optional(),
				priority: z.enum(PRIORITIES).optional(),
				dueDate: nullableDay.optional(),
				startDate: nullableDay.optional(),
				tags: tagNames.optional(),
			}),
		)
		.mutation(({ ctx, input: { code, ...patch } }) =>
			detailAfter(ctx.svc, code, updateItem(ctx.svc, code, patch)),
		),

	transition: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemStatus })
		.input(z.object({ code, to: z.enum(ITEM_STATUSES) }))
		.mutation(({ ctx, input }) =>
			detailAfter(
				ctx.svc,
				input.code,
				transitionItem(ctx.svc, input.code, input.to),
			),
		),

	assign: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemAssign })
		.input(z.object({ code, assigneeId: userId }))
		.mutation(({ ctx, input }) =>
			detailAfter(
				ctx.svc,
				input.code,
				assignItem(ctx.svc, input.code, input.assigneeId),
			),
		),

	convert: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemConvert })
		.input(z.object({ code, assigneeId: userId }))
		.mutation(({ ctx, input }) =>
			detailAfter(
				ctx.svc,
				input.code,
				convertItem(ctx.svc, input.code, input.assigneeId),
			),
		),

	delete: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemDelete })
		.input(z.object({ code }))
		.mutation(({ ctx, input }) => deleteItem(ctx.svc, input.code)),

	restore: adminProcedure
		.meta({ audit: AUDIT_ACTIONS.itemRestore })
		.input(z.object({ code }))
		.mutation(({ ctx, input }) =>
			detailAfter(ctx.svc, input.code, restoreItem(ctx.svc, input.code)),
		),

	trash: adminProcedure.query(({ ctx }) => trashItems(ctx.svc)),
});
