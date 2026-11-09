import { oc } from "@orpc/contract";
import { z } from "zod";

import { daysBetween } from "~/domain/due";
import {
	COMMENT_MAX_LENGTH,
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

import { code, nullableDay, numericId, userId } from "./fields";
import {
	comment,
	ganttItem,
	itemDetail,
	itemPage,
	item as itemSchema,
	scheduleItem,
	summary,
	timelineEvent,
} from "./schemas";

const title = z.string().trim().min(1, "标题不能为空").max(TITLE_MAX_LENGTH);
const description = z.string().max(DESCRIPTION_MAX_LENGTH).meta({
	description: "Markdown（GFM）；@ 人的写法是 `@[姓名](user:<user id>)`",
});
const tagNames = z
	.array(z.string().max(TAG_NAME_MAX_LENGTH))
	.max(10)
	.meta({ description: "标签名，不存在的会新建；整组替换" });
const priority = z.enum(PRIORITIES);

const createFields = {
	title,
	description: description.default(""),
	dueDate: nullableDay.default(null).meta({ description: "期望完成日期" }),
	tags: tagNames.default([]),
};

const STATE_MACHINE = `
状态机（\`status\`）：
- ticket：open（待处理）→ in_progress（处理中）→ resolved（已解决）由负责人推进（也可 open → resolved、in_progress → open）；resolved → closed（确认关闭）或 resolved → in_progress（打回）由提单人做；提单人还能撤回（open / in_progress → closed）与重开（closed → open）。
- todo：本人 open ⇄ in_progress，open / in_progress → closed（完成），closed → open（重开），没有 resolved。
- 管理员能走任意一条合法边。当前身份能去的状态见详情的 \`permissions.statuses\`。`;

export const itemContract = oc.tag("条目").router({
	list: oc
		.route({
			method: "GET",
			path: "/items",
			summary: "列出条目",
			description:
				"看得见的条目：ticket 全员可见，todo 只有本人。数组参数写成 `statuses[]=open&statuses[]=in_progress`，对象写成 `sort[by]=due&sort[dir]=asc`、`due[from]=2026-11-01`。按 `nextCursor` 翻页。",
		})
		.input(
			z.object({
				types: z.array(z.enum(ITEM_TYPES)).optional(),
				statuses: z.array(z.enum(ITEM_STATUSES)).optional(),
				priorities: z
					.array(z.enum(PRIORITY_FILTERS))
					.optional()
					.meta({ description: "含 untriaged（待定级）" }),
				assigneeIds: z.array(userId).max(50).optional(),
				reporterIds: z.array(userId).max(50).optional(),
				tagIds: z.array(numericId).max(50).optional(),
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
					.optional()
					.meta({
						description:
							"overdue / today / next7 只算进行中的；none = 没设期望完成；或给 {from, to}（含当天）",
					}),
				q: z
					.string()
					.max(100)
					.optional()
					.meta({ description: "单号精确匹配，或标题模糊匹配" }),
				sort: z
					.object({ by: z.enum(ITEM_SORTS), dir: z.enum(SORT_DIRS) })
					.optional()
					.meta({ description: "缺省按优先级、同级按期望完成" }),
				cursor: numericId.optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.output(itemPage),

	create: oc
		.route({
			method: "POST",
			path: "/items",
			successStatus: 201,
			summary: "建单",
			description:
				"ticket 必须指定负责人（assigneeId，从 GET /users 查），建单后是待定级，由负责人定优先级；todo 只属于自己，要给优先级。负责人会收到站内通知。",
		})
		.input(
			z.discriminatedUnion("type", [
				z.object({
					type: z.literal("ticket"),
					assigneeId: userId,
					...createFields,
				}),
				z.object({
					type: z.literal("todo"),
					priority,
					startDate: nullableDay
						.default(null)
						.meta({ description: "计划开始日期" }),
					...createFields,
				}),
			]),
		)
		.output(itemDetail),

	get: oc
		.route({
			method: "GET",
			path: "/items/{code}",
			summary: "条目详情",
			description: `含 \`permissions\`：当前身份能做什么。看不见的与不存在的一样回 404。${STATE_MACHINE}`,
		})
		.input(z.object({ code }))
		.output(itemDetail),

	update: oc
		.route({
			method: "PATCH",
			path: "/items/{code}",
			summary: "编辑条目",
			description:
				"只传要改的字段。优先级与计划开始日期只有负责人与管理员能改（`permissions.plan`）。带上详情里的 `updatedAt` 作 `expectedUpdatedAt` 可防覆盖别人的修改（被改过回 409）。改状态、改派各有单独的接口。",
		})
		.input(
			z.object({
				code,
				expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
				title: title.optional(),
				description: description.optional(),
				priority: priority.optional(),
				dueDate: nullableDay.optional(),
				startDate: nullableDay.optional(),
				tags: tagNames.optional(),
			}),
		)
		.output(itemDetail),

	delete: oc
		.route({
			method: "DELETE",
			path: "/items/{code}",
			summary: "删除条目",
			description:
				"进回收站（管理员可恢复）。ticket 的提单人、todo 的本人、管理员能删。",
		})
		.input(z.object({ code }))
		.output(z.object({ code: z.string() })),

	transition: oc
		.route({
			method: "POST",
			path: "/items/{code}/transition",
			summary: "改状态",
			description: `走不了的边回 403。相关的人会收到通知。${STATE_MACHINE}`,
		})
		.input(z.object({ code, to: z.enum(ITEM_STATUSES) }))
		.output(itemDetail),

	assign: oc
		.route({
			method: "POST",
			path: "/items/{code}/assign",
			summary: "改派",
			description:
				"只有 ticket 能改派，只有当前负责人与管理员能做，已关闭的不能。新负责人会收到通知。",
		})
		.input(z.object({ code, assigneeId: userId }))
		.output(itemDetail),

	convert: oc
		.route({
			method: "POST",
			path: "/items/{code}/convert",
			summary: "todo 转 ticket",
			description:
				"本人或管理员把未关闭的 todo 交给某人，单号不变。交给别人时变回待定级，由对方定优先级。",
		})
		.input(z.object({ code, assigneeId: userId }))
		.output(itemDetail),

	restore: oc
		.route({
			method: "POST",
			path: "/items/{code}/restore",
			summary: "从回收站恢复",
			description: "只有管理员。",
		})
		.input(z.object({ code }))
		.output(itemDetail),

	timeline: oc
		.route({
			method: "GET",
			path: "/items/{code}/timeline",
			summary: "时间线",
			description: "这张单的变更记录（谁、何时、改了什么）；不含评论。",
		})
		.input(z.object({ code }))
		.output(z.array(timelineEvent)),

	trash: oc
		.route({
			method: "GET",
			path: "/trash",
			summary: "回收站",
			description: "已删除的条目，只有管理员。",
		})
		.output(z.array(itemSchema)),
});

const body = z
	.string()
	.trim()
	.min(1, "评论不能为空")
	.max(COMMENT_MAX_LENGTH)
	.meta({
		description:
			"Markdown（GFM）；@ 人写成 `@[姓名](user:<user id>)`，被 @ 的人会收到通知",
	});

export const commentContract = oc.tag("评论").router({
	list: oc
		.route({
			method: "GET",
			path: "/items/{code}/comments",
			summary: "评论列表",
		})
		.input(z.object({ code }))
		.output(z.array(comment)),

	create: oc
		.route({
			method: "POST",
			path: "/items/{code}/comments",
			successStatus: 201,
			summary: "发评论",
			description:
				"看得见的单都能评论（已删除的不能）。回这张单的最新评论列表。",
		})
		.input(z.object({ code, body }))
		.output(z.array(comment)),

	update: oc
		.route({
			method: "PATCH",
			path: "/items/{code}/comments/{id}",
			summary: "改评论",
			description: "只能改自己的。只通知新加的 @。回最新评论列表。",
		})
		.input(z.object({ code, id: numericId, body }))
		.output(z.array(comment)),

	delete: oc
		.route({
			method: "DELETE",
			path: "/items/{code}/comments/{id}",
			summary: "删评论",
			description: "自己的，或管理员。回最新评论列表。",
		})
		.input(z.object({ code, id: numericId }))
		.output(z.array(comment)),
});

/** 日历、甘特的区间：起止含当天，最多 `SCHEDULE_MAX_DAYS` 天 */
const scheduleRange = z
	.object({
		from: z.iso.date(),
		to: z.iso.date(),
		scope: z.enum(SCHEDULE_SCOPES).meta({
			description:
				"assigned：我负责的 · reported：我提的 ticket · all：看得见的全部（都不含已关闭）",
		}),
	})
	.refine((r) => {
		const n = daysBetween(r.from, r.to);
		return n >= 0 && n < SCHEDULE_MAX_DAYS;
	}, `起止要有序，最多 ${SCHEDULE_MAX_DAYS} 天`);

export const viewContract = oc.tag("视图").router({
	summary: oc
		.route({
			method: "GET",
			path: "/views/summary",
			summary: "我的概览",
			description: "首页的四个数。",
		})
		.output(summary),

	board: oc
		.route({
			method: "GET",
			path: "/views/board",
			summary: "四象限看板",
			description:
				"mine：需要我处理的（我负责的进行中 + 我提的、等我确认的已解决）· reported：我提的 ticket · all：看得见的全部。都不含已关闭，最多 500 条。",
		})
		.input(z.object({ scope: z.enum(BOARD_SCOPES) }))
		.output(z.array(itemSchema)),

	calendar: oc
		.route({
			method: "GET",
			path: "/views/calendar",
			summary: "日历",
			description: "期望完成日期落在 [from, to] 的单，只回画图用的几列。",
		})
		.input(scheduleRange)
		.output(z.array(scheduleItem)),

	gantt: oc
		.route({
			method: "GET",
			path: "/views/gantt",
			summary: "甘特图",
			description:
				"有期望完成日期、且 [起点, 期望完成] 与 [from, to] 有交集的单。起点 = 计划开始，没排就是建单那天。",
		})
		.input(scheduleRange)
		.output(z.array(ganttItem)),
});
