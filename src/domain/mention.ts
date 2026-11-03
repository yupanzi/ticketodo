/**
 * 评论里的 @：正文存 `@[显示名](user:<id>)`，渲染时把 `user:` 链接画成提及。被 @ 的人一律由服务端
 * 从正文解析（别信客户端传的列表），且只认库里存在的人。
 */

const MENTION = /@\[([^\]\n]{1,64})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

export const MENTION_SCHEME = "user:";

export function formatMention(name: string, userId: string): string {
	// 显示名里的 ] 与换行会截断语法
	return `@[${name.replace(/[\]\n]/g, " ").slice(0, 64)}](${MENTION_SCHEME}${userId})`;
}

/** 正文里被 @ 的 user id，去重、保持首次出现的顺序 */
export function parseMentions(body: string): string[] {
	const ids: string[] = [];
	for (const m of body.matchAll(MENTION)) {
		const id = m[2];
		if (id && !ids.includes(id)) ids.push(id);
	}
	return ids;
}

/** 编辑评论时只通知新加的 @，已通知过的不再打扰 */
export function addedMentions(
	before: readonly string[],
	after: readonly string[],
) {
	return after.filter((id) => !before.includes(id));
}
