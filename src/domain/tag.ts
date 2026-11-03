export const TAG_NAME_MAX_LENGTH = 32;

/** 标签色板：只存色名，具体色值在 UI（`~/components/tag-badge`） */
export const TAG_COLORS = [
	"slate",
	"red",
	"orange",
	"amber",
	"green",
	"teal",
	"blue",
	"violet",
	"pink",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** 去首尾空白、合并内部空白；空的丢掉；按小写去重（库里也按 lower(name) 唯一） */
export function normalizeTagNames(names: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of names) {
		const name = raw.trim().replace(/\s+/g, " ").slice(0, TAG_NAME_MAX_LENGTH);
		const key = name.toLowerCase();
		if (!name || seen.has(key)) continue;
		seen.add(key);
		out.push(name);
	}
	return out;
}
