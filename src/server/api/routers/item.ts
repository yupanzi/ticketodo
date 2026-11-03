import { z } from "zod";

import {
	DESCRIPTION_MAX_LENGTH,
	ITEM_STATUSES,
	ITEM_TYPES,
	TITLE_MAX_LENGTH,
} from "~/domain/item";
import { PRIORITIES } from "~/domain/priority";
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
	convertItem,
	createItem,
	deleteItem,
	getItem,
	listItems,
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
const dueDate = z.iso.date().nullable();
const tagNames = z.array(z.string().max(TAG_NAME_MAX_LENGTH)).max(10);

const createFields = {
	title,
	description: description.default(""),
	priority: z.enum(PRIORITIES),
	dueDate: dueDate.default(null),
	tags: tagNames.default([]),
};

export const itemRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemCreate })
		.input(
			z.discriminatedUnion("type", [
				// ticket 必须指定负责人：不存在未指派的单
				z.object({
					type: z.literal("ticket"),
					assigneeId: userId,
					...createFields,
				}),
				z.object({ type: z.literal("todo"), ...createFields }),
			]),
		)
		.mutation(({ ctx, input }) => createItem(ctx.svc, input)),

	byCode: protectedProcedure
		.input(z.object({ code }))
		.query(({ ctx, input }) => getItem(ctx.svc, input.code)),

	list: protectedProcedure
		.input(
			z.object({
				type: z.enum(ITEM_TYPES).optional(),
				statuses: z.array(z.enum(ITEM_STATUSES)).optional(),
				priorities: z.array(z.enum(PRIORITIES)).optional(),
				assigneeId: userId.optional(),
				reporterId: userId.optional(),
				tagId: z.number().int().positive().optional(),
				overdue: z.boolean().optional(),
				q: z.string().max(100).optional(),
				cursor: z.number().int().positive().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.query(({ ctx, input }) => listItems(ctx.svc, input)),

	board: protectedProcedure
		.input(z.object({ scope: z.enum(["mine", "reported", "all"]) }))
		.query(({ ctx, input }) => boardItems(ctx.svc, input.scope)),

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
				dueDate: dueDate.optional(),
				tags: tagNames.optional(),
			}),
		)
		.mutation(({ ctx, input: { code, ...patch } }) =>
			updateItem(ctx.svc, code, patch),
		),

	transition: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemStatus })
		.input(z.object({ code, to: z.enum(ITEM_STATUSES) }))
		.mutation(({ ctx, input }) =>
			transitionItem(ctx.svc, input.code, input.to),
		),

	assign: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemAssign })
		.input(z.object({ code, assigneeId: userId }))
		.mutation(({ ctx, input }) =>
			assignItem(ctx.svc, input.code, input.assigneeId),
		),

	convert: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemConvert })
		.input(z.object({ code, assigneeId: userId }))
		.mutation(({ ctx, input }) =>
			convertItem(ctx.svc, input.code, input.assigneeId),
		),

	delete: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.itemDelete })
		.input(z.object({ code }))
		.mutation(({ ctx, input }) => deleteItem(ctx.svc, input.code)),

	restore: adminProcedure
		.meta({ audit: AUDIT_ACTIONS.itemRestore })
		.input(z.object({ code }))
		.mutation(({ ctx, input }) => restoreItem(ctx.svc, input.code)),

	trash: adminProcedure.query(({ ctx }) => trashItems(ctx.svc)),
});
