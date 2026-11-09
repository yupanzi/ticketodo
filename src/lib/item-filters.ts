import { isDay } from "~/domain/due";
import {
	ITEM_STATUSES,
	ITEM_TYPES,
	type ItemStatus,
	type ItemType,
} from "~/domain/item";
import {
	DEFAULT_SORT,
	DUE_PRESETS,
	type DueFilter,
	ITEM_SORTS,
	type ItemSort,
	NATURAL_DIR,
	SORT_DIRS,
} from "~/domain/item-list";
import { PRIORITY_FILTERS, type PriorityFilter } from "~/domain/priority";

/** 列表的筛选与排序：与地址栏双向同步，链接可以直接发给同事 */
export interface ListFilterState {
	q: string;
	types: ItemType[];
	statuses: ItemStatus[];
	/** 含 `untriaged`（待定级） */
	priorities: PriorityFilter[];
	tagIds: number[];
	assigneeIds: string[];
	reporterIds: string[];
	due: DueFilter | null;
	sort: ItemSort;
}

/** 不看已关闭的：日常看的是还要做的事 */
const DEFAULT_STATUSES: ItemStatus[] = ["open", "in_progress", "resolved"];

export const DEFAULT_FILTERS: ListFilterState = {
	q: "",
	types: [],
	statuses: DEFAULT_STATUSES,
	priorities: [],
	tagIds: [],
	assigneeIds: [],
	reporterIds: [],
	due: null,
	sort: DEFAULT_SORT,
};

const USER_ID = /^[\w-]{1,64}$/;

/** 到期：快捷项原样；范围写成 `起..止`，缺一端留空 */
function dueToParam(due: DueFilter): string {
	return typeof due === "string" ? due : `${due.from ?? ""}..${due.to ?? ""}`;
}

function parseDue(raw: string | undefined): DueFilter | null {
	const preset = DUE_PRESETS.find((p) => p === raw);
	if (preset) return preset;
	const [from, to] = (raw ?? "").split("..");
	const range = {
		...(from && isDay(from) ? { from } : {}),
		...(to && isDay(to) ? { to } : {}),
	};
	return range.from || range.to ? range : null;
}

type Params = Record<string, string | string[] | undefined>;

/** 地址栏 → 筛选：只认合法值，其余回落默认（链接可能是手改的） */
export function parseListFilters(p: Params): ListFilterState {
	const one = (k: string) => {
		const v = p[k];
		return typeof v === "string" ? v : undefined;
	};
	const list = (k: string) => (one(k) ?? "").split(",").filter(Boolean);
	const pick = <T extends string>(k: string, allowed: readonly T[]) =>
		list(k).filter((x): x is T => allowed.includes(x as T));
	const by = ITEM_SORTS.find((s) => s === one("sort"));
	const dir = SORT_DIRS.find((d) => d === one("order"));
	return {
		q: one("q") ?? "",
		types: pick("type", ITEM_TYPES),
		// 带了 status= 就照它（空 = 不限状态），没带才用默认
		statuses:
			one("status") === undefined
				? DEFAULT_STATUSES
				: pick("status", ITEM_STATUSES),
		priorities: pick("priority", PRIORITY_FILTERS),
		tagIds: list("tag")
			.filter((x) => /^\d+$/.test(x))
			.map(Number),
		assigneeIds: list("assignee").filter((x) => USER_ID.test(x)),
		reporterIds: list("reporter").filter((x) => USER_ID.test(x)),
		due: parseDue(one("due")),
		sort: by ? { by, dir: dir ?? NATURAL_DIR[by] } : DEFAULT_SORT,
	};
}

/** 筛选 → `?…`：与默认相同的项不写，逗号不转义（地址栏里好读） */
export function toSearch(f: ListFilterState): string {
	const parts: [string, string][] = [];
	const put = (k: string, v: string) => parts.push([k, v]);
	if (f.q.trim()) put("q", f.q.trim());
	if (f.types.length) put("type", f.types.join(","));
	if (f.statuses.join() !== DEFAULT_STATUSES.join())
		put("status", f.statuses.join(","));
	if (f.priorities.length) put("priority", f.priorities.join(","));
	if (f.tagIds.length) put("tag", f.tagIds.join(","));
	if (f.assigneeIds.length) put("assignee", f.assigneeIds.join(","));
	if (f.reporterIds.length) put("reporter", f.reporterIds.join(","));
	if (f.due) put("due", dueToParam(f.due));
	if (f.sort.by !== DEFAULT_SORT.by || f.sort.dir !== DEFAULT_SORT.dir) {
		put("sort", f.sort.by);
		if (f.sort.dir !== NATURAL_DIR[f.sort.by]) put("order", f.sort.dir);
	}
	if (!parts.length) return "";
	return `?${parts
		.map(([k, v]) => `${k}=${encodeURIComponent(v).replaceAll("%2C", ",")}`)
		.join("&")}`;
}

/**
 * 筛选状态 → `item.list` 的入参。列表页的服务端预取与 ItemsTable 都用它：两边拼出的查询 key
 * 不一致，预取的就白取了。
 */
export function listQueryInput(f: ListFilterState) {
	return {
		...f,
		due: f.due ?? undefined,
		q: f.q.trim() || undefined,
		limit: 50,
	};
}

/** 列表分页游标：服务端预取与 ItemsTable 共用 */
export const nextListCursor = (last: { nextCursor?: number | null }) =>
	last.nextCursor ?? undefined;

/** 别处跳到列表（如首页概览卡片）：只写想改的项，其余用默认 */
export function listHref(patch: Partial<ListFilterState>): string {
	return `/items${toSearch({ ...DEFAULT_FILTERS, ...patch })}`;
}

/** 排序之外有没有偏离默认：决定「重置」出不出现（重置不动排序） */
export function hasActiveFilters(f: ListFilterState): boolean {
	return toSearch({ ...f, sort: DEFAULT_SORT }) !== "";
}
