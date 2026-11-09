import { z } from "zod";

/** 入参里反复出现的字段 */

export const code = z
	.string()
	.trim()
	.min(1)
	.max(32)
	.meta({ description: "单号，如 TK-20261109-0001（大小写不敏感）" });

export const userId = z.string().min(1).max(64);

export const numericId = z.number().int().positive();

/** `YYYY-MM-DD` 或 null（清空） */
export const nullableDay = z.iso.date().nullable();
