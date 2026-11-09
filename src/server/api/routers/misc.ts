import { AUDIT_ACTIONS } from "~/server/resources";
import {
	createApiKey,
	listAllApiKeys,
	listMyApiKeys,
	revokeApiKey,
	rotateApiKey,
} from "~/server/services/api-key";
import { queryAudit } from "~/server/services/audit-query";
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
	usersByIds,
} from "~/server/services/user";

import { openApiSpec } from "../openapi";
import { guard, os } from "../orpc";

const ok = { ok: true } as const;

export const tagRouter = {
	list: os.tag.list.use(guard()).handler(({ context }) => listTags(context.db)),

	update: os.tag.update
		.use(guard({ audit: AUDIT_ACTIONS.tagUpdate, admin: true }))
		.handler(({ context, input: { id, ...patch } }) =>
			updateTag(context.svc, id, patch),
		),

	merge: os.tag.merge
		.use(guard({ audit: AUDIT_ACTIONS.tagMerge, admin: true }))
		.handler(async ({ context, input }) => {
			await mergeTag(context.svc, input.id, input.targetId);
			return ok;
		}),

	delete: os.tag.delete
		.use(guard({ audit: AUDIT_ACTIONS.tagDelete, admin: true }))
		.handler(async ({ context, input }) => {
			await deleteTag(context.svc, input.id);
			return ok;
		}),
};

export const userRouter = {
	me: os.user.me.use(guard()).handler(({ context }) => ({
		...context.svc.actor,
		apiKey: context.principal.apiKey,
	})),

	list: os.user.list
		.use(guard())
		.handler(({ context, input }) =>
			input.ids?.length
				? usersByIds(context.db, input.ids)
				: searchUsers(context.db, input.q ?? "", input.limit),
		),
};

export const notificationRouter = {
	list: os.notification.list
		.use(guard())
		.handler(({ context, input }) => listNotifications(context.svc, input)),

	unreadCount: os.notification.unreadCount
		.use(guard())
		.handler(async ({ context }) => ({
			count: await unreadCount(context.svc),
		})),

	markRead: os.notification.markRead
		.use(guard())
		.handler(async ({ context, input }) => {
			await markRead(context.svc, input.ids);
			return ok;
		}),

	markAllRead: os.notification.markAllRead
		.use(guard())
		.handler(async ({ context }) => {
			await markRead(context.svc, "all");
			return ok;
		}),
};

export const apiKeyRouter = {
	list: os.apiKey.list
		.use(guard({ browserOnly: true }))
		.handler(({ context }) => listMyApiKeys(context.svc)),

	create: os.apiKey.create
		.use(guard({ audit: AUDIT_ACTIONS.apiKeyCreate, browserOnly: true }))
		.handler(({ context, input }) => createApiKey(context.svc, input)),

	rotate: os.apiKey.rotate
		.use(guard({ audit: AUDIT_ACTIONS.apiKeyRotate, browserOnly: true }))
		.handler(({ context, input }) => rotateApiKey(context.svc, input.id)),

	revoke: os.apiKey.revoke
		.use(guard({ audit: AUDIT_ACTIONS.apiKeyRevoke, browserOnly: true }))
		.handler(async ({ context, input }) => {
			await revokeApiKey(context.svc, input.id);
			return ok;
		}),
};

export const adminRouter = {
	users: os.admin.users
		.use(guard({ admin: true }))
		.handler(({ context }) => listUsersForAdmin(context.db)),

	setRole: os.admin.setRole
		.use(guard({ audit: AUDIT_ACTIONS.adminGrant, admin: true }))
		.handler(async ({ context, input }) => {
			await setUserRole(context.svc, input.id, input.role);
			return ok;
		}),

	auditLogs: os.admin.auditLogs
		.use(guard({ admin: true }))
		.handler(({ context, input: { from, to, ...rest } }) =>
			queryAudit(context.db, {
				...rest,
				from: from ? new Date(from) : undefined,
				to: to ? new Date(to) : undefined,
			}),
		),

	apiKeys: os.admin.apiKeys
		.use(guard({ admin: true, browserOnly: true }))
		.handler(({ context }) => listAllApiKeys(context.svc)),

	revokeApiKey: os.admin.revokeApiKey
		.use(
			guard({
				audit: AUDIT_ACTIONS.apiKeyRevoke,
				admin: true,
				browserOnly: true,
			}),
		)
		.handler(async ({ context, input }) => {
			await revokeApiKey(context.svc, input.id);
			return ok;
		}),
};

export const docsRouter = {
	openapi: os.docs.openapi
		.use(guard())
		.handler(() => openApiSpec() as Promise<Record<string, unknown>>),
};
