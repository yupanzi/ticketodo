export const AUDIT_STATUSES = ["success", "failure"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/**
 * - `user`：登录的人，actorId 是 better-auth 的 user id；登录前就失败的为空
 * - `system`：种子管理员、到期提醒等无人触发的动作，actorId 为空；也是列默认值
 *
 * ⚠️ 只加不删：删值要重建 PG 枚举，不再写入的值也留着。
 */
export const AUDIT_ACTOR_TYPES = ["user", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** 字段级变更：键是字段名，人与标签存 `{ id, name }` 快照（人改名后历史照样看得懂） */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

export type AuditDetails = {
	summary?: string;
	changes?: AuditChanges;
	/** 系统任务的计数等结构化附加信息 */
	counts?: Record<string, number>;
};

/** `path` 列宽。截断时留 `…`，看得出被截过 */
export const MAX_REQUEST_PATH_LENGTH = 512;

export const MAX_REQUEST_ID_LENGTH = 64;

/** `ip` 列宽。信任代理时它来自 X-Forwarded-For，任何人都能造 */
export const MAX_IP_LENGTH = 64;

export const MAX_ACTOR_ID_LENGTH = 255;

/** 超长截断并留 `…`，看得出被截过 */
function clamp(v: string, max: number): string {
	return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/** ⚠️ 落库、进日志前剥掉 query string：OAuth 回调的 code / state 在里面 */
export function normalizeRequestPath(
	path: string | null | undefined,
): string | null {
	if (!path) return null;
	const trimmed = path.trim();
	const q = trimmed.indexOf("?");
	const withoutQuery = q === -1 ? trimmed : trimmed.slice(0, q);
	return withoutQuery ? clamp(withoutQuery, MAX_REQUEST_PATH_LENGTH) : null;
}

/** ⚠️ 来件能控制的值不能让审计写入失败：超长的 ip 截断 */
export function normalizeIp(ip: string | null | undefined): string | null {
	return ip ? clamp(ip, MAX_IP_LENGTH) : null;
}
