import { describe, expect, it } from "vitest";

import {
	DEFAULT_FILTERS,
	hasActiveFilters,
	type ListFilterState,
	listHref,
	parseListFilters,
	toSearch,
} from "./item-filters";

const roundTrip = (f: ListFilterState) =>
	parseListFilters(
		Object.fromEntries(new URLSearchParams(toSearch(f).slice(1))),
	);

describe("列表筛选 ⇄ 地址栏", () => {
	it("默认值不写进地址栏", () => {
		expect(toSearch(DEFAULT_FILTERS)).toBe("");
		expect(parseListFilters({})).toEqual(DEFAULT_FILTERS);
	});

	it("写出去再读回来不变", () => {
		const f: ListFilterState = {
			q: "打印机",
			types: ["ticket"],
			statuses: ["open", "closed"],
			priorities: ["P0", "P1"],
			tagIds: [3, 7],
			assigneeIds: ["u1", "u2"],
			reporterIds: ["u3"],
			due: { from: "2026-11-01", to: "2026-11-30" },
			sort: { by: "updated", dir: "asc" },
		};
		expect(roundTrip(f)).toEqual(f);
		expect(roundTrip({ ...f, due: "next7" }).due).toBe("next7");
		expect(roundTrip({ ...f, due: { to: "2026-11-30" } }).due).toEqual({
			to: "2026-11-30",
		});
	});

	it("清空状态 ≠ 默认状态：status= 表示不限", () => {
		const f = { ...DEFAULT_FILTERS, statuses: [] };
		expect(toSearch(f)).toBe("?status=");
		expect(roundTrip(f).statuses).toEqual([]);
	});

	it("排序：自然方向不写 order", () => {
		expect(
			toSearch({ ...DEFAULT_FILTERS, sort: { by: "due", dir: "asc" } }),
		).toBe("?sort=due");
		expect(
			toSearch({ ...DEFAULT_FILTERS, sort: { by: "priority", dir: "desc" } }),
		).toBe("?sort=priority&order=desc");
	});

	it("手改的非法值回落默认", () => {
		expect(
			parseListFilters({
				type: "bug",
				priority: "P9,P1",
				tag: "x,2",
				due: "2026-13..",
				sort: "title",
				assignee: "<script>",
			}),
		).toEqual({ ...DEFAULT_FILTERS, priorities: ["P1"], tagIds: [2] });
	});

	it("listHref 只写想改的项；重置按钮只看筛选不看排序", () => {
		expect(listHref({ assigneeIds: ["me"], due: "overdue" })).toBe(
			"/items?assignee=me&due=overdue",
		);
		expect(
			hasActiveFilters({ ...DEFAULT_FILTERS, sort: { by: "due", dir: "asc" } }),
		).toBe(false);
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, q: "x" })).toBe(true);
	});
});
