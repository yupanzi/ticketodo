import { describe, expect, it } from "vitest";

import { formatItemCode, parseItemCode } from "./item-code";

describe("单号", () => {
	it("北京日期 + 至少 4 位序号", () => {
		expect(formatItemCode("2026-10-01", 42)).toBe("TK-20261001-0042");
		expect(formatItemCode("2026-10-01", 12345)).toBe("TK-20261001-12345");
	});

	it("解析与格式化互逆，大小写不敏感", () => {
		expect(parseItemCode("TK-20261001-0042")).toEqual({
			day: "2026-10-01",
			seq: 42,
		});
		expect(parseItemCode("tk-20261001-12345")?.seq).toBe(12345);
	});

	it.each(["TK-2026101-0042", "TK-20261001-42", "XX-20261001-0042", "123"])(
		"%s 不是单号",
		(code) => {
			expect(parseItemCode(code)).toBeNull();
		},
	);

	it("参数不合法直接抛，不产出坏单号", () => {
		expect(() => formatItemCode("2026/10/01", 1)).toThrow();
		expect(() => formatItemCode("2026-10-01", 0)).toThrow();
	});
});
