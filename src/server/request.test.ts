import { describe, expect, it } from "vitest";

import { resolveRequestId } from "./request";

const UUID = /^[0-9a-f-]{36}$/;

describe("resolveRequestId", () => {
	it("信任代理且形状合法：沿用（含 ingress-nginx 的 32 位 hex）", () => {
		const nginx = "0123456789abcdef0123456789abcdef";
		expect(resolveRequestId(nginx, true)).toBe(nginx);
	});

	it("不信任代理：一律新生成，来件种不进审计", () => {
		expect(resolveRequestId("0123456789abcdef", false)).toMatch(UUID);
	});

	it.each([null, "short", "x".repeat(65), "has space 123", "a/b/c/d/e/f"])(
		"形状不合法（%o）：新生成",
		(incoming) => {
			expect(resolveRequestId(incoming, true)).toMatch(UUID);
		},
	);
});
