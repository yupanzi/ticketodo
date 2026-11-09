import { AUDIT_ACTIONS } from "~/server/resources";
import {
	addComment,
	deleteComment,
	editComment,
	listComments,
} from "~/server/services/comment";
import type { ServiceContext } from "~/server/services/context";
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

import { guard, os } from "../orpc";

/**
 * 改单的接口都回最新详情（与 GET /items/{code} 同形）：浏览器拿它当场更新页面，AI 拿它确认结果，
 * 都不用改完再查一趟。服务端多一次查库是毫秒级，省下的是一个网络往返。
 */
async function detailAfter(
	svc: ServiceContext,
	code: string,
	write: Promise<unknown>,
) {
	await write;
	return getItem(svc, code);
}

export const itemRouter = {
	list: os.item.list
		.use(guard())
		.handler(({ context, input }) => listItems(context.svc, input)),

	create: os.item.create
		.use(guard({ audit: AUDIT_ACTIONS.itemCreate }))
		.handler(async ({ context, input }) => {
			const { code } = await createItem(context.svc, input);
			return getItem(context.svc, code);
		}),

	get: os.item.get
		.use(guard())
		.handler(({ context, input }) => getItem(context.svc, input.code)),

	update: os.item.update
		.use(guard({ audit: AUDIT_ACTIONS.itemUpdate }))
		.handler(({ context, input: { code, expectedUpdatedAt, ...patch } }) =>
			detailAfter(
				context.svc,
				code,
				updateItem(context.svc, code, {
					...patch,
					expectedUpdatedAt: expectedUpdatedAt
						? new Date(expectedUpdatedAt)
						: undefined,
				}),
			),
		),

	delete: os.item.delete
		.use(guard({ audit: AUDIT_ACTIONS.itemDelete }))
		.handler(async ({ context, input }) => {
			await deleteItem(context.svc, input.code);
			return { code: input.code.toUpperCase() };
		}),

	transition: os.item.transition
		.use(guard({ audit: AUDIT_ACTIONS.itemStatus }))
		.handler(({ context, input }) =>
			detailAfter(
				context.svc,
				input.code,
				transitionItem(context.svc, input.code, input.to),
			),
		),

	assign: os.item.assign
		.use(guard({ audit: AUDIT_ACTIONS.itemAssign }))
		.handler(({ context, input }) =>
			detailAfter(
				context.svc,
				input.code,
				assignItem(context.svc, input.code, input.assigneeId),
			),
		),

	convert: os.item.convert
		.use(guard({ audit: AUDIT_ACTIONS.itemConvert }))
		.handler(({ context, input }) =>
			detailAfter(
				context.svc,
				input.code,
				convertItem(context.svc, input.code, input.assigneeId),
			),
		),

	restore: os.item.restore
		.use(guard({ audit: AUDIT_ACTIONS.itemRestore, admin: true }))
		.handler(({ context, input }) =>
			detailAfter(
				context.svc,
				input.code,
				restoreItem(context.svc, input.code),
			),
		),

	timeline: os.item.timeline
		.use(guard())
		.handler(({ context, input }) => timeline(context.svc, input.code)),

	trash: os.item.trash
		.use(guard({ admin: true }))
		.handler(({ context }) => trashItems(context.svc)),
};

/** 评论的变更都回这张单的最新评论列表，理由同 `detailAfter` */
export const commentRouter = {
	list: os.comment.list
		.use(guard())
		.handler(({ context, input }) => listComments(context.svc, input.code)),

	create: os.comment.create
		.use(guard({ audit: AUDIT_ACTIONS.commentCreate }))
		.handler(async ({ context, input }) => {
			await addComment(context.svc, input.code, input.body);
			return listComments(context.svc, input.code);
		}),

	update: os.comment.update
		.use(guard({ audit: AUDIT_ACTIONS.commentUpdate }))
		.handler(async ({ context, input }) => {
			await editComment(context.svc, input.code, input.id, input.body);
			return listComments(context.svc, input.code);
		}),

	delete: os.comment.delete
		.use(guard({ audit: AUDIT_ACTIONS.commentDelete }))
		.handler(async ({ context, input }) => {
			await deleteComment(context.svc, input.code, input.id);
			return listComments(context.svc, input.code);
		}),
};

export const viewRouter = {
	summary: os.view.summary
		.use(guard())
		.handler(({ context }) => mySummary(context.svc)),

	board: os.view.board
		.use(guard())
		.handler(({ context, input }) => boardItems(context.svc, input.scope)),

	calendar: os.view.calendar
		.use(guard())
		.handler(({ context, input }) => calendarItems(context.svc, input)),

	gantt: os.view.gantt
		.use(guard())
		.handler(({ context, input }) => ganttItems(context.svc, input)),
};
