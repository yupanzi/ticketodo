/**
 * 资源命名的唯一来源。不 import 任何东西：drizzle.config.ts 也引它。
 *
 * ⚠️ 改项目名 `ticketodo` 时还有：`~/server/db/schema/table.ts` 的表前缀、各 schema 文件里手写的
 * pgEnum / 索引 / 触发器函数名。刻意各写字面量：它们进数据库，共用常量会让「改个显示名」变成一次
 * 数据迁移。
 */

/**
 * drizzle 的迁移记录表。⚠️ 别用默认的 `drizzle.__drizzle_migrations`：drizzle 只读最新一行来判断
 * 哪些迁移已跑，与别的项目共库时会互相跳过对方的迁移。放 public 是因为共库时 `drizzle` schema 可能
 * 归别的项目的角色所有，建不了表。`drizzle.config.ts` 与 `bin/migrate.ts` 两处都读这里。
 */
export const MIGRATIONS = {
	table: "ticketodo_migrations",
	schema: "public",
} as const;

/**
 * better-auth 的 cookie 前缀。同一个域名（本机 localhost 尤其）下别的 better-auth 应用默认也叫
 * `better-auth.*`，不改会互相覆盖会话。`proxy.ts` 判断有无会话 cookie 时读同一个值。
 */
export const AUTH_COOKIE_PREFIX = "ticketodo";

// advisory lock 的键空间是 per-database 全局的，表前缀护不住
const LOCK_NAMESPACE = "ticketodo";

export const ADVISORY_LOCKS = {
	/** 授予 / 撤销管理员串行化：否则两个并发撤销都看到「还剩 2 个」，结果一个不剩 */
	adminRoles: `${LOCK_NAMESPACE}:admin_roles`,
} as const;

/** 审计动作串，`<实体>.<动词>`，首段冗余进 `target_type` 列 */
export const AUDIT_ACTIONS = {
	/** 登录成功（会话建立） */
	authSignIn: "auth.signIn",
	authSignOut: "auth.signOut",
	/** OAuth 回调失败（state 不符、IdP 报错等），尽力而为 */
	authReject: "auth.reject",

	/** 首次登录建档 */
	userCreate: "user.create",

	adminGrant: "admin.grant",
	adminRevoke: "admin.revoke",
	/** `BOOTSTRAP_ADMIN_EMAILS` 生效，actor 是 system */
	adminBootstrap: "admin.bootstrap",

	itemCreate: "item.create",
	/** 标题 / 描述 / 优先级 / 期望完成日期 / 标签 */
	itemUpdate: "item.update",
	itemStatus: "item.status",
	itemAssign: "item.assign",
	/** todo → ticket */
	itemConvert: "item.convert",
	itemDelete: "item.delete",
	itemRestore: "item.restore",

	commentCreate: "comment.create",
	commentUpdate: "comment.update",
	commentDelete: "comment.delete",

	tagCreate: "tag.create",
	tagUpdate: "tag.update",
	tagMerge: "tag.merge",
	tagDelete: "tag.delete",

	/** API key 的签发、重新签发（换密钥）、撤销 */
	apiKeyCreate: "apiKey.create",
	apiKeyRotate: "apiKey.rotate",
	apiKeyRevoke: "apiKey.revoke",

	/** 到期提醒的一次运行，actor 是 system，details 带计数 */
	notifyDueRemind: "notify.dueRemind",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
