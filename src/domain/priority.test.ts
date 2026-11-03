import { describe, expect, it } from "vitest";

import { PRIORITIES, priorityOf, quadrantOf } from "./priority";

describe("四象限 ↔ P 级", () => {
	it("P0 重要紧急 · P1 重要不紧急 · P2 紧急不重要 · P3 都不", () => {
		expect(quadrantOf("P0")).toEqual({ important: true, urgent: true });
		expect(quadrantOf("P1")).toEqual({ important: true, urgent: false });
		expect(quadrantOf("P2")).toEqual({ important: false, urgent: true });
		expect(quadrantOf("P3")).toEqual({ important: false, urgent: false });
	});

	it("互为逆映射", () => {
		for (const p of PRIORITIES) expect(priorityOf(quadrantOf(p))).toBe(p);
	});
});
