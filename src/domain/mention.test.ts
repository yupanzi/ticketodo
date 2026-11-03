import { describe, expect, it } from "vitest";

import { addedMentions, formatMention, parseMentions } from "./mention";

describe("parseMentions", () => {
	it("解析出 user id，去重保序", () => {
		const body = `${formatMention("张三", "u1")} 看下，${formatMention("李四", "u2")} 也看，再 ${formatMention("张三", "u1")}`;
		expect(parseMentions(body)).toEqual(["u1", "u2"]);
	});

	it("普通链接与不合法的 id 不算", () => {
		expect(parseMentions("[文档](https://x) @[某人](user:a/b) @张三")).toEqual(
			[],
		);
	});

	it("显示名里的 ] 不会截断语法", () => {
		expect(parseMentions(formatMention("a]b", "u9"))).toEqual(["u9"]);
	});
});

describe("addedMentions", () => {
	it("编辑后只算新加的", () => {
		expect(addedMentions(["u1", "u2"], ["u2", "u3"])).toEqual(["u3"]);
	});
});
