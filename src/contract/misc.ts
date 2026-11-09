import { oc } from "@orpc/contract";
import { z } from "zod";

import {
	API_KEY_LEVELS,
	API_KEY_MAX_TTL_DAYS,
	API_KEY_NAME_MAX_LENGTH,
} from "~/domain/api-key";
import { AUDIT_STATUSES } from "~/domain/audit";
import { TAG_COLORS, TAG_NAME_MAX_LENGTH } from "~/domain/tag";

import { numericId, userId } from "./fields";
import {
	adminApiKey,
	adminUser,
	apiKey,
	auditRow,
	issuedApiKey,
	me,
	notification,
	tag,
	userOption,
	userRole,
} from "./schemas";

const ok = z.object({ ok: z.literal(true) });

export const tagContract = oc.tag("标签").router({
	list: oc
		.route({
			method: "GET",
			path: "/tags",
			summary: "全部标签",
			description: "标签是全局的；给条目打标签时传标签名，不存在的会自动新建。",
		})
		.output(z.array(tag)),

	update: oc
		.route({
			method: "PATCH",
			path: "/tags/{id}",
			summary: "改标签",
			description: "只有管理员。",
		})
		.input(
			z.object({
				id: numericId,
				name: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH).optional(),
				color: z.enum(TAG_COLORS).optional(),
			}),
		)
		.output(tag),

	merge: oc
		.route({
			method: "POST",
			path: "/tags/{id}/merge",
			summary: "合并标签",
			description: "把这个标签并进 targetId 后删掉它，只有管理员。",
		})
		.input(z.object({ id: numericId, targetId: numericId }))
		.output(ok),

	delete: oc
		.route({
			method: "DELETE",
			path: "/tags/{id}",
			summary: "删标签",
			description: "只有管理员；条目上的这个标签一并去掉。",
		})
		.input(z.object({ id: numericId }))
		.output(ok),
});

export const userContract = oc.tag("成员").router({
	me: oc
		.route({
			method: "GET",
			path: "/users/me",
			summary: "我是谁",
			description: "当前身份，经 API key 调用时含 key 的名称与级别。",
		})
		.output(me),

	list: oc
		.route({
			method: "GET",
			path: "/users",
			summary: "找人",
			description:
				"按姓名或邮箱搜（q），或按 id 取（ids[]=…）。只有登录过的人在列，指派与 @ 都从这里取 id。",
		})
		.input(
			z.object({
				q: z.string().max(64).optional(),
				ids: z.array(userId).max(50).optional(),
				limit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.output(z.array(userOption)),
});

export const notificationContract = oc.tag("通知").router({
	list: oc
		.route({
			method: "GET",
			path: "/notifications",
			summary: "我的通知",
			description: "新的在前，按 nextCursor 翻页。",
		})
		.input(
			z.object({
				cursor: numericId.optional(),
				limit: z.number().int().min(1).max(100).default(30),
				unreadOnly: z.boolean().default(false),
			}),
		)
		.output(
			z.object({
				items: z.array(notification),
				nextCursor: z.number().int().nullable(),
			}),
		),

	unreadCount: oc
		.route({
			method: "GET",
			path: "/notifications/unread-count",
			summary: "未读数",
		})
		.output(z.object({ count: z.number().int() })),

	markRead: oc
		.route({
			method: "POST",
			path: "/notifications/read",
			summary: "标为已读",
		})
		.input(z.object({ ids: z.array(numericId).min(1).max(100) }))
		.output(ok),

	markAllRead: oc
		.route({
			method: "POST",
			path: "/notifications/read-all",
			summary: "全部标为已读",
		})
		.output(ok),
});

const keyId = z.string().min(1).max(64);

export const apiKeyContract = oc.tag("API key").router({
	list: oc
		.route({
			method: "GET",
			path: "/api-keys",
			summary: "我的 API key",
			description: "只认浏览器登录：API key 不能管理 API key。",
		})
		.output(z.array(apiKey)),

	create: oc
		.route({
			method: "POST",
			path: "/api-keys",
			successStatus: 201,
			summary: "签发 API key",
			description:
				"明文只在响应里出现这一次。read：按成员判权、只能调 GET；write：按成员判权；admin：本人的全部权限，只有管理员能签。",
		})
		.input(
			z.object({
				name: z.string().trim().min(1).max(API_KEY_NAME_MAX_LENGTH),
				level: z.enum(API_KEY_LEVELS),
				ttlDays: z
					.number()
					.int()
					.min(1)
					.max(API_KEY_MAX_TTL_DAYS)
					.nullable()
					.meta({ description: "有效期（天）；null = 永不过期" }),
			}),
		)
		.output(issuedApiKey),

	rotate: oc
		.route({
			method: "POST",
			path: "/api-keys/{id}/rotate",
			summary: "重新签发",
			description:
				"换一个新密钥，旧的立即失效；名称、级别不变，有效期从现在起再给签发时选的天数。只有本人。",
		})
		.input(z.object({ id: keyId }))
		.output(issuedApiKey),

	revoke: oc
		.route({
			method: "DELETE",
			path: "/api-keys/{id}",
			summary: "撤销",
		})
		.input(z.object({ id: keyId }))
		.output(ok),
});

export const adminContract = oc.tag("管理").router({
	users: oc
		.route({ method: "GET", path: "/admin/users", summary: "全部成员" })
		.output(z.array(adminUser)),

	setRole: oc
		.route({
			method: "PUT",
			path: "/admin/users/{id}/role",
			summary: "设角色",
			description: "授予或撤销管理员；至少保留一名管理员。",
		})
		.input(z.object({ id: userId, role: userRole }))
		.output(ok),

	auditLogs: oc
		.route({
			method: "GET",
			path: "/admin/audit-logs",
			summary: "审计日志",
			description: "新的在前，按 nextCursor 翻页。",
		})
		.input(
			z.object({
				from: z.iso.datetime({ offset: true }).optional(),
				to: z.iso.datetime({ offset: true }).optional(),
				actorId: z.string().max(255).optional(),
				action: z
					.string()
					.max(96)
					.optional()
					.meta({ description: "前缀匹配，如 item. 查全部条目动作" }),
				status: z.enum(AUDIT_STATUSES).optional(),
				target: z
					.string()
					.max(255)
					.optional()
					.meta({ description: "单号，或 targetType:targetId" }),
				apiKeyId: keyId.optional(),
				cursor: numericId.optional(),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.output(
			z.object({
				rows: z.array(auditRow),
				nextCursor: z.number().int().nullable(),
			}),
		),

	apiKeys: oc
		.route({
			method: "GET",
			path: "/admin/api-keys",
			summary: "全员的 API key",
		})
		.output(z.array(adminApiKey)),

	revokeApiKey: oc
		.route({
			method: "DELETE",
			path: "/admin/api-keys/{id}",
			summary: "撤销任何人的 API key",
		})
		.input(z.object({ id: keyId }))
		.output(ok),
});

export const docsContract = oc.tag("文档").router({
	openapi: oc
		.route({
			method: "GET",
			path: "/openapi.json",
			summary: "OpenAPI 文档",
			description: "本文档。要带 API key 或登录态。",
		})
		.output(z.record(z.string(), z.unknown())),
});
