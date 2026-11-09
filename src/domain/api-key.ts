/**
 * API key：个人 token，AI 拿着它以签发人的身份调 `/api/v1`。级别决定判权用的身份：
 * - read：按成员判权，只能调 GET 接口
 * - write：按成员判权
 * - admin：签发人的全部权限（含管理员），只有管理员能签；签发人被撤销管理员后直接拒，不悄悄降级
 *
 * PG 枚举从这里取值：只加不删。
 */

export const API_KEY_LEVELS = ["read", "write", "admin"] as const;
export type ApiKeyLevel = (typeof API_KEY_LEVELS)[number];

export const API_KEY_LEVEL_LABEL: Record<ApiKeyLevel, string> = {
	read: "只读",
	write: "读写",
	admin: "管理员",
};

/**
 * `tk_` + 43 位 base62（256 bit）。前缀让 secret scanning 与日志脱敏认得出它，服务端也据此判断
 * Bearer 是不是 API key。
 */
export const API_KEY_PREFIX = "tk_";
export const API_KEY_SECRET_LENGTH = 43;
export const API_KEY_PATTERN = /^tk_[A-Za-z0-9]{43}$/;
/** 列表里只显示前几位，认得出是哪个 key 就够 */
export const API_KEY_START_LENGTH = 9;

export const API_KEY_NAME_MAX_LENGTH = 64;
/** 签发页的快捷选项（天）；也可以自定义日期或永不过期 */
export const API_KEY_TTL_PRESETS = [30, 90, 365] as const;
export const API_KEY_MAX_TTL_DAYS = 3650;

/**
 * key 请求以什么身份判权；null = 拒绝（管理员级 key 的签发人已不是管理员）。
 * ⚠️ 别把 admin 级在签发人失去管理员后降成 write：AI 会带着「我是管理员」的假设继续操作。
 */
export function apiKeyActorRole(
	level: ApiKeyLevel,
	userRole: "member" | "admin",
): "member" | "admin" | null {
	if (level === "admin") return userRole === "admin" ? "admin" : null;
	return "member";
}

/** 只读 key 只放行声明为 GET 的接口：GET 一律无副作用，这条才拦得住所有写 */
export function apiKeyAllowsMethod(
	level: ApiKeyLevel,
	method: string,
): boolean {
	return level !== "read" || method === "GET";
}

export function isApiKeyExpired(
	expiresAt: Date | string | null,
	now: Date = new Date(),
): boolean {
	return expiresAt !== null && new Date(expiresAt).getTime() <= now.getTime();
}
