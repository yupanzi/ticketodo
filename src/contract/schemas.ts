import { z } from "zod";

import { API_KEY_LEVELS } from "~/domain/api-key";
import { AUDIT_ACTOR_TYPES, AUDIT_STATUSES } from "~/domain/audit";
import { ITEM_STATUSES, ITEM_TYPES } from "~/domain/item";
import { NOTIFICATION_KINDS } from "~/domain/notify";
import { USER_ROLES } from "~/domain/policy";
import { PRIORITIES } from "~/domain/priority";
import { TAG_COLORS } from "~/domain/tag";

/**
 * 输出的 schema：既是 OpenAPI 文档里的响应结构（AI 靠它知道回来什么），也是服务端返回值的运行时
 * 校验。时间戳在服务端是 Date，线上是 ISO 字符串；日期（`YYYY-MM-DD`）一律北京时间。
 */

/** 时间戳：线上是 ISO 8601（UTC），显示时转北京时间 */
export const timestamp = z.date();
/** `YYYY-MM-DD`，北京时间的日期 */
export const day = z.iso.date();

export const priority = z.enum(PRIORITIES);
export const itemType = z.enum(ITEM_TYPES);
export const itemStatus = z.enum(ITEM_STATUSES);

export const userRef = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string().nullable(),
});

export const userOption = userRef.extend({
	/** 没有真实邮箱的人为 null */
	email: z.string().nullable(),
});

export const tag = z.object({
	id: z.number().int(),
	name: z.string(),
	color: z.enum(TAG_COLORS),
});

export const item = z.object({
	id: z.number().int(),
	code: z.string().meta({ description: "单号，如 TK-20261109-0001" }),
	type: itemType.meta({
		description: "ticket：交给别人做的单；todo：只有自己看得见的待办",
	}),
	title: z.string(),
	description: z.string().meta({ description: "Markdown（GFM）" }),
	priority: priority.nullable().meta({
		description:
			"P0 重要且紧急 · P1 重要不紧急 · P2 紧急不重要 · P3 不重要不紧急；null = 待定级（ticket 建单后由负责人定）",
	}),
	status: itemStatus,
	dueDate: day.nullable().meta({ description: "期望完成日期" }),
	startDate: day.nullable().meta({ description: "计划开始日期（负责人排期）" }),
	createdAt: timestamp,
	updatedAt: timestamp,
	resolvedAt: timestamp.nullable(),
	closedAt: timestamp.nullable(),
	convertedAt: timestamp
		.nullable()
		.meta({ description: "todo 转成 ticket 的时刻" }),
	deletedAt: timestamp.nullable(),
	reporter: userRef.meta({ description: "提单人（todo 即本人）" }),
	assignee: userRef.meta({ description: "负责人（todo 即本人）" }),
	tags: z.array(tag),
});

export const itemPermissions = z
	.object({
		edit: z.boolean(),
		plan: z
			.boolean()
			.meta({ description: "能否改优先级与计划开始日期（负责人与管理员）" }),
		assign: z.boolean(),
		statuses: z
			.array(itemStatus)
			.meta({ description: "当前身份能把它改到的状态" }),
		delete: z.boolean(),
		restore: z.boolean(),
		convert: z.boolean(),
		comment: z.boolean(),
	})
	.meta({
		description: "当前身份对这张单能做什么，按它决定下一步，免得撞 403",
	});

export const itemDetail = z.object({ item, permissions: itemPermissions });

export const itemPage = z.object({
	items: z.array(item),
	nextCursor: z
		.number()
		.int()
		.nullable()
		.meta({ description: "传给下一页的 cursor；null = 没有更多" }),
});

export const comment = z.object({
	id: z.number().int(),
	body: z.string().nullable().meta({ description: "已删除的评论为 null" }),
	author: userRef,
	apiKeyName: z
		.string()
		.nullable()
		.meta({ description: "正文最后一次经哪个 API key 写的；null = 浏览器" }),
	createdAt: timestamp,
	updatedAt: timestamp,
	deletedAt: timestamp.nullable(),
	canEdit: z.boolean(),
	canDelete: z.boolean(),
});

const auditChanges = z.record(
	z.string(),
	z.object({ from: z.unknown(), to: z.unknown() }),
);

export const timelineEvent = z.object({
	id: z.number().int(),
	at: timestamp,
	action: z.string().meta({ description: "如 item.status、item.assign" }),
	actorName: z.string().nullable(),
	apiKeyName: z
		.string()
		.nullable()
		.meta({ description: "经哪个 API key 做的；null = 浏览器" }),
	summary: z.string().nullable(),
	changes: auditChanges.nullable(),
});

export const scheduleItem = z.object({
	code: z.string(),
	title: z.string(),
	priority: priority.nullable(),
	status: itemStatus,
	dueDate: day.nullable(),
	startDate: day.nullable(),
});

export const ganttItem = scheduleItem.extend({
	spanStart: day.meta({
		description: "甘特条起点：计划开始日期，没排就是建单那天",
	}),
});

export const summary = z.object({
	overdue: z.number().int().meta({ description: "我负责、进行中、已逾期" }),
	dueToday: z.number().int().meta({ description: "我负责、进行中、今天到期" }),
	awaitingConfirmation: z
		.number()
		.int()
		.meta({ description: "我提的 ticket 已解决、等我确认关闭" }),
	active: z.number().int().meta({ description: "我负责、进行中" }),
});

export const notification = z.object({
	id: z.number().int(),
	kind: z.enum(NOTIFICATION_KINDS),
	payload: z.object({
		code: z.string(),
		title: z.string(),
		itemType,
		actorName: z.string().optional(),
		status: z.object({ from: itemStatus, to: itemStatus }).optional(),
		excerpt: z.string().optional(),
		dueDate: z.string().optional(),
	}),
	readAt: timestamp.nullable(),
	createdAt: timestamp,
});

export const userRole = z.enum(USER_ROLES);

export const me = z.object({
	id: z.string(),
	name: z.string(),
	role: userRole.meta({
		description: "本次请求判权用的身份：只读、读写级 API key 一律是 member",
	}),
	apiKey: z
		.object({
			id: z.string(),
			name: z.string(),
			level: z.enum(API_KEY_LEVELS),
		})
		.nullable()
		.meta({ description: "经 API key 调用时是这个 key；浏览器为 null" }),
});

export const adminUser = userOption.extend({
	role: userRole,
	createdAt: timestamp,
});

export const auditRow = z.object({
	id: z.number().int(),
	at: timestamp,
	actorType: z.enum(AUDIT_ACTOR_TYPES),
	actorId: z.string().nullable(),
	actorName: z.string().nullable(),
	action: z.string(),
	status: z.enum(AUDIT_STATUSES),
	targetType: z.string(),
	targetId: z.string().nullable(),
	targetName: z.string().nullable(),
	ip: z.string().nullable(),
	userAgent: z.string().nullable(),
	method: z.string().nullable(),
	path: z.string().nullable(),
	requestId: z.string().nullable(),
	apiKeyId: z.string().nullable(),
	apiKeyName: z.string().nullable(),
	details: z
		.object({
			summary: z.string().optional(),
			changes: auditChanges.optional(),
			counts: z.record(z.string(), z.number()).optional(),
		})
		.nullable(),
});

export const apiKey = z.object({
	id: z.string(),
	name: z.string(),
	level: z.enum(API_KEY_LEVELS),
	start: z.string().meta({ description: "明文前几位，认 key 用" }),
	ttlDays: z
		.number()
		.int()
		.nullable()
		.meta({ description: "签发时选的有效期（天）；null = 永不过期" }),
	expiresAt: timestamp.nullable(),
	lastUsedAt: timestamp.nullable(),
	createdAt: timestamp,
	rotatedAt: timestamp.nullable(),
});

export const adminApiKey = apiKey.extend({ owner: userRef });

export const issuedApiKey = z.object({
	key: apiKey,
	token: z
		.string()
		.meta({ description: "明文，只在这一次响应里出现，库里只存哈希" }),
});
