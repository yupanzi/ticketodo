import { describe, expect, it } from "vitest";

import {
	API_KEY_PATTERN,
	apiKeyActorRole,
	apiKeyAllowsMethod,
	isApiKeyExpired,
} from "./api-key";

describe("apiKeyActorRole", () => {
	it("只读、读写一律按成员判权，管理员签的也是", () => {
		expect(apiKeyActorRole("read", "admin")).toBe("member");
		expect(apiKeyActorRole("write", "admin")).toBe("member");
		expect(apiKeyActorRole("write", "member")).toBe("member");
	});

	it("管理员级：签发人仍是管理员才放行，否则拒而不降级", () => {
		expect(apiKeyActorRole("admin", "admin")).toBe("admin");
		expect(apiKeyActorRole("admin", "member")).toBeNull();
	});
});

describe("apiKeyAllowsMethod", () => {
	it("只读 key 只放行 GET", () => {
		expect(apiKeyAllowsMethod("read", "GET")).toBe(true);
		for (const m of ["POST", "PATCH", "PUT", "DELETE"])
			expect(apiKeyAllowsMethod("read", m)).toBe(false);
	});

	it("读写与管理员级不限方法", () => {
		expect(apiKeyAllowsMethod("write", "DELETE")).toBe(true);
		expect(apiKeyAllowsMethod("admin", "POST")).toBe(true);
	});
});

describe("isApiKeyExpired", () => {
	const now = new Date("2026-11-09T00:00:00Z");
	it("null 永不过期", () => {
		expect(isApiKeyExpired(null, now)).toBe(false);
	});
	it("到点即过期", () => {
		expect(isApiKeyExpired("2026-11-09T00:00:00Z", now)).toBe(true);
		expect(isApiKeyExpired(new Date("2026-11-09T00:00:01Z"), now)).toBe(false);
	});
});

describe("API_KEY_PATTERN", () => {
	it("tk_ + 43 位 base62", () => {
		expect(API_KEY_PATTERN.test(`tk_${"a".repeat(43)}`)).toBe(true);
		expect(API_KEY_PATTERN.test(`tk_${"a".repeat(42)}`)).toBe(false);
		expect(API_KEY_PATTERN.test(`tk_${"a".repeat(42)}-`)).toBe(false);
	});
});
