import { z } from "zod";

import { AUDIT_STATUSES } from "~/domain/audit";
import { TAG_COLORS, TAG_NAME_MAX_LENGTH } from "~/domain/tag";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { USER_ROLES } from "~/server/db/schema";
import { AUDIT_ACTIONS } from "~/server/resources";
import { queryAudit } from "~/server/services/audit-query";
import {
	addComment,
	COMMENT_MAX_LENGTH,
	deleteComment,
	editComment,
	listComments,
} from "~/server/services/comment";
import {
	listNotifications,
	markRead,
	unreadCount,
} from "~/server/services/notification";
import {
	deleteTag,
	listTags,
	mergeTag,
	updateTag,
} from "~/server/services/tag";
import {
	listUsersForAdmin,
	searchUsers,
	setUserRole,
} from "~/server/services/user";

const code = z.string().trim().min(1).max(32);
const body = z.string().trim().min(1, "评论不能为空").max(COMMENT_MAX_LENGTH);
const id = z.number().int().positive();

export const commentRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ code }))
		.query(({ ctx, input }) => listComments(ctx.svc, input.code)),
	add: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.commentCreate })
		.input(z.object({ code, body }))
		.mutation(({ ctx, input }) => addComment(ctx.svc, input.code, input.body)),
	edit: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.commentUpdate })
		.input(z.object({ id, body }))
		.mutation(({ ctx, input }) => editComment(ctx.svc, input.id, input.body)),
	delete: protectedProcedure
		.meta({ audit: AUDIT_ACTIONS.commentDelete })
		.input(z.object({ id }))
		.mutation(({ ctx, input }) => deleteComment(ctx.svc, input.id)),
});

export const tagRouter = createTRPCRouter({
	list: protectedProcedure.query(({ ctx }) => listTags(ctx.db)),
	update: adminProcedure
		.meta({ audit: AUDIT_ACTIONS.tagUpdate })
		.input(
			z.object({
				id,
				name: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH).optional(),
				color: z.enum(TAG_COLORS).optional(),
			}),
		)
		.mutation(({ ctx, input: { id, ...patch } }) =>
			updateTag(ctx.svc, id, patch),
		),
	merge: adminProcedure
		.meta({ audit: AUDIT_ACTIONS.tagMerge })
		.input(z.object({ sourceId: id, targetId: id }))
		.mutation(({ ctx, input }) =>
			mergeTag(ctx.svc, input.sourceId, input.targetId),
		),
	delete: adminProcedure
		.meta({ audit: AUDIT_ACTIONS.tagDelete })
		.input(z.object({ id }))
		.mutation(({ ctx, input }) => deleteTag(ctx.svc, input.id)),
});

export const userRouter = createTRPCRouter({
	me: protectedProcedure.query(({ ctx }) => ctx.svc.actor),
	search: protectedProcedure
		.input(
			z.object({
				q: z.string().max(64).default(""),
				limit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.query(({ ctx, input }) => searchUsers(ctx.db, input.q, input.limit)),
});

export const notificationRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z.object({
				cursor: id.optional(),
				limit: z.number().int().min(1).max(100).default(30),
				unreadOnly: z.boolean().default(false),
			}),
		)
		.query(({ ctx, input }) => listNotifications(ctx.svc, input)),
	unreadCount: protectedProcedure.query(({ ctx }) => unreadCount(ctx.svc)),
	markRead: protectedProcedure
		.input(z.object({ ids: z.array(id).min(1).max(100) }))
		.mutation(({ ctx, input }) => markRead(ctx.svc, input.ids)),
	markAllRead: protectedProcedure.mutation(({ ctx }) =>
		markRead(ctx.svc, "all"),
	),
});

export const adminRouter = createTRPCRouter({
	users: adminProcedure.query(({ ctx }) => listUsersForAdmin(ctx.db)),
	setRole: adminProcedure
		.meta({ audit: AUDIT_ACTIONS.adminGrant })
		.input(z.object({ userId: z.string().min(1), role: z.enum(USER_ROLES) }))
		.mutation(({ ctx, input }) =>
			setUserRole(ctx.svc, input.userId, input.role),
		),
	audit: adminProcedure
		.input(
			z.object({
				from: z.date().optional(),
				to: z.date().optional(),
				actorId: z.string().max(255).optional(),
				action: z.string().max(96).optional(),
				status: z.enum(AUDIT_STATUSES).optional(),
				target: z.string().max(255).optional(),
				cursor: id.optional(),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.query(({ ctx, input }) => queryAudit(ctx.db, input)),
});
