import type {
	InferContractRouterInputs,
	InferContractRouterOutputs,
} from "@orpc/contract";

import { commentContract, itemContract, viewContract } from "./item";
import {
	adminContract,
	apiKeyContract,
	docsContract,
	notificationContract,
	tagContract,
	userContract,
} from "./misc";

/**
 * API 契约：`/api/v1` 下全部接口的路径、方法、入参与响应。前端、AI（读 OpenAPI）、服务端实现读的是
 * 同一份。⚠️ 只依赖 zod 与 `~/domain`：浏览器会打包它，别 import 任何 `~/server`。
 */
export const contract = {
	item: itemContract,
	comment: commentContract,
	view: viewContract,
	tag: tagContract,
	user: userContract,
	notification: notificationContract,
	apiKey: apiKeyContract,
	admin: adminContract,
	docs: docsContract,
};

export type Contract = typeof contract;
export type ApiInputs = InferContractRouterInputs<Contract>;
/** 服务端视角（时间戳是 Date）；浏览器拿到的是 `~/orpc/client` 的 `ApiOutputs`（ISO 字符串） */
export type ServerOutputs = InferContractRouterOutputs<Contract>;
