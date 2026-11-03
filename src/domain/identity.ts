/**
 * authentik profile → 本地用户字段。身份只认 `sub`（better-auth 的 account），这里只管展示用的字段。
 */

/** better-auth 要求 email 必填且唯一；没有邮箱的人（dingorg 允许缺省）合成一个保留域名的地址 */
export const NO_EMAIL_DOMAIN = "noemail.invalid";

export interface AuthentikProfile {
	sub?: string | number | null;
	name?: unknown;
	preferred_username?: unknown;
	email?: unknown;
	picture?: unknown;
}

// 只做形状判断：真伪由 authentik 负责，这里只防空串与明显不是邮箱的值
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nonEmpty(v: unknown): string | undefined {
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function profileEmail(profile: AuthentikProfile): string {
	const email = nonEmpty(profile.email)?.toLowerCase();
	if (email && EMAIL.test(email)) return email;
	// sub 是 authentik 的哈希 id 或 uuid；仍按 local part 的字符集收一遍
	const local = String(profile.sub ?? "unknown").replace(
		/[^A-Za-z0-9._-]/g,
		"-",
	);
	return `${local}@${NO_EMAIL_DOMAIN}`;
}

export function hasRealEmail(email: string): boolean {
	return !email.endsWith(`@${NO_EMAIL_DOMAIN}`);
}

export function profileName(profile: AuthentikProfile): string {
	return (
		nonEmpty(profile.name) ??
		nonEmpty(profile.preferred_username) ??
		String(profile.sub ?? "未知用户")
	);
}

export function profileImage(profile: AuthentikProfile): string | undefined {
	const picture = nonEmpty(profile.picture);
	return picture && /^https?:\/\//.test(picture) ? picture : undefined;
}

/**
 * OAuth 回调失败时 Location 里的 `error`。⚠️ 它可能原样来自 IdP 的回调参数（来件可控）：只收错误码
 * 形状的值，其余记成 unknown，免得把任意串写进审计。
 */
export function oauthErrorCode(raw: string | null | undefined): string {
	return raw && /^[a-z0-9_]{1,64}$/i.test(raw) ? raw.toLowerCase() : "unknown";
}
