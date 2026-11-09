import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { contract } from "~/contract";
import {
	apiKey,
	comment,
	item,
	itemDetail,
	notification,
	tag,
	timelineEvent,
	userOption,
	userRef,
} from "~/contract/schemas";
import { getServerEnv } from "~/server/env";

export const API_PREFIX = "/api/v1";

export const schemaConverters = [new ZodToJsonSchemaConverter()];

const DESCRIPTION = `ticketodo 的全部接口：浏览器与 AI 调的是同一套。

**认证**：\`Authorization: Bearer tk_…\`（在「接口密钥」页签发）。key 以签发人的身份操作，权限、通知、审计与本人在页面上操作一样，界面上会标「API」。
- read 级：按成员判权，只能调 GET
- write 级：按成员判权
- admin 级：签发人的全部权限（含管理员）

**错误**：响应体 \`{ code, status, message, data? }\`。401 没认证或 key 无效；403 看得见但不让做（message 说明原因）；404 不存在或看不见（别人的 todo 一律 404）；409 编辑冲突；400 参数不合法（message 写明字段）。

**约定**：时间戳是 ISO 8601（UTC）；日期是 \`YYYY-MM-DD\`，按北京时间算（「今天」「逾期」都是北京时间）。GET 的数组参数写成 \`statuses[]=open&statuses[]=in_progress\`，对象写成 \`sort[by]=due&sort[dir]=asc\`。先看 \`GET /items/{code}\` 返回的 \`permissions\` 再操作，能少撞 403。`;

let spec: Promise<unknown> | undefined;

/** 每个进程生成一次：契约是代码，运行时不会变 */
export function openApiSpec(): Promise<unknown> {
	spec ??= new OpenAPIGenerator({ schemaConverters }).generate(contract, {
		info: { title: "ticketodo API", version: "1", description: DESCRIPTION },
		servers: [{ url: `${getServerEnv().BETTER_AUTH_URL}${API_PREFIX}` }],
		components: {
			securitySchemes: {
				apiKey: {
					type: "http",
					scheme: "bearer",
					description: "tk_ 开头的个人 API key",
				},
			},
		},
		security: [{ apiKey: [] }],
		commonSchemas: {
			UserRef: { schema: userRef, strategy: "output" },
			UserOption: { schema: userOption, strategy: "output" },
			Tag: { schema: tag, strategy: "output" },
			Item: { schema: item, strategy: "output" },
			ItemDetail: { schema: itemDetail, strategy: "output" },
			Comment: { schema: comment, strategy: "output" },
			TimelineEvent: { schema: timelineEvent, strategy: "output" },
			Notification: { schema: notification, strategy: "output" },
			ApiKey: { schema: apiKey, strategy: "output" },
		},
	});
	return spec;
}
