import { describe, expect, it } from "vitest";

import {
	hasRealEmail,
	NO_EMAIL_DOMAIN,
	oauthErrorCode,
	profileEmail,
	profileImage,
	profileName,
} from "./identity";

describe("profileEmail", () => {
	it("有邮箱就用，转小写", () => {
		expect(profileEmail({ sub: "s1", email: " Alice@Corp.COM " })).toBe(
			"alice@corp.com",
		);
	});

	// dingorg 允许没有邮箱；authentik 可能发空串或不发
	it.each([undefined, "", "   ", "not-an-email", null])(
		"没有可用邮箱（%o）：按 sub 合成保留域名地址",
		(email) => {
			const out = profileEmail({ sub: "ab12/cd", email });
			expect(out).toBe(`ab12-cd@${NO_EMAIL_DOMAIN}`);
			expect(hasRealEmail(out)).toBe(false);
		},
	);
});

describe("profileName", () => {
	it("name → preferred_username → sub 依次兜底", () => {
		expect(
			profileName({ sub: "s", name: "张三", preferred_username: "zs" }),
		).toBe("张三");
		expect(profileName({ sub: "s", name: " ", preferred_username: "zs" })).toBe(
			"zs",
		);
		expect(profileName({ sub: "s" })).toBe("s");
	});
});

describe("profileImage", () => {
	it("只收 http(s) 地址", () => {
		expect(profileImage({ picture: "https://a/b.png" })).toBe(
			"https://a/b.png",
		);
		expect(profileImage({ picture: "javascript:alert(1)" })).toBeUndefined();
		expect(profileImage({})).toBeUndefined();
	});
});

describe("oauthErrorCode", () => {
	it("错误码形状的原样（转小写），其余记 unknown：来件可控的值不进审计", () => {
		expect(oauthErrorCode("access_denied")).toBe("access_denied");
		expect(oauthErrorCode("State_Not_Found")).toBe("state_not_found");
		expect(oauthErrorCode("<script>")).toBe("unknown");
		expect(oauthErrorCode("x".repeat(65))).toBe("unknown");
		expect(oauthErrorCode(null)).toBe("unknown");
	});
});
