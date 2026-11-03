import type { AuditChanges } from "./audit";

/**
 * 字段级 diff，进审计 `details.changes`，时间线照它渲染。只比白名单字段：漏比的字段不进时间线，
 * 多比的（如 updatedAt）会让每次保存都带噪声。值按 JSON 比较：标签数组先排好序再传进来。
 */
export function diffFields<T extends Record<string, unknown>>(
	before: T,
	after: Partial<T>,
	fields: readonly (keyof T & string)[],
): AuditChanges {
	const changes: AuditChanges = {};
	for (const field of fields) {
		if (!(field in after)) continue;
		const from = before[field] ?? null;
		const to = after[field] ?? null;
		if (JSON.stringify(from) !== JSON.stringify(to))
			changes[field] = { from, to };
	}
	return changes;
}

export function hasChanges(changes: AuditChanges): boolean {
	return Object.keys(changes).length > 0;
}
