---
name: ticketodo
description: 用个人 API key 调企业内部 ticketodo（ticket 与 todo 系统，单号形如 TK-20261109-0001）的 REST API：查单、建单、定级、改状态、改派、评论 @ 人、看通知。常见说法——"在 ticketodo 上给 xx 提个单"、"我手上有哪些单"、"需要我处理的"、"TK-20261109-0003 什么情况"、"把这张单标成已解决"、"给这张单评论一下 @ 某人"、"哪些单逾期了"、"记个 todo"、"这张单转给 xx"。适用于已设好 TICKETODO_URL 与 TICKETODO_API_KEY 的场景；不是 Notion 上的工单库。
---

# 用 API key 操作 ticketodo

ticketodo 的浏览器与 AI 调同一套接口：`$TICKETODO_URL/api/v1`。key 以签发人的身份操作：权限、通知、
审计与本人在页面上操作一样，界面上标「API」。**你做的每个写操作，同事都看得到是经 API 做的**——
写之前把要做的事说清楚，拿不准就先问用户。

## 前置：环境变量

```bash
test -n "${TICKETODO_URL:-}"     && echo "TICKETODO_URL=$TICKETODO_URL" || echo "❌ TICKETODO_URL 未设置（如 https://ticketodo.example.com，不带 /api/v1、不带结尾 /）"
test -n "${TICKETODO_API_KEY:-}" && echo "TICKETODO_API_KEY 已设置"     || echo "❌ TICKETODO_API_KEY 未设置：在 ticketodo 侧栏「接口密钥」签发，tk_ 开头"
```

没有就问用户要，别猜。key 只在签发时显示一次；丢了让用户在页面上「重新签发」。

## 调用方式

```bash
tk() { # tk METHOD PATH [JSON]；bash 与 zsh 通用（别改成 ${3:+…}：zsh 不分词）
  if [ -n "${3:-}" ]; then
    curl -sS -g -X "$1" "$TICKETODO_URL/api/v1$2" -H "Authorization: Bearer $TICKETODO_API_KEY" \
      -H "Content-Type: application/json" -d "$3"
  else
    curl -sS -g -X "$1" "$TICKETODO_URL/api/v1$2" -H "Authorization: Bearer $TICKETODO_API_KEY"
  fi
}
tk GET /users/me        # 先确认身份与 key 级别（read 只能 GET）
```

- `-g` 必须带：query 里的 `statuses[]=open` 要原样发出去。
- 不确定某个接口或字段时读文档：`tk GET /openapi.json | jq '.paths | keys'`，再看具体的
  `.paths["/items/{code}/transition"]`。文档是这套接口唯一的真相，下面只是常用的几条。

## 常用接口

| 做什么 | 请求 |
| --- | --- |
| 我是谁 | `GET /users/me` |
| 找人（拿 user id） | `GET /users?q=张三` |
| 需要我处理的 | `GET /views/board?scope=mine` |
| 概览（逾期、今天到期、待我确认、进行中） | `GET /views/summary` |
| 列表 / 搜索 | `GET /items?statuses[]=open&statuses[]=in_progress&assigneeIds[]=<id>&q=关键词&limit=20` |
| 逾期的 | `GET /items?due=overdue` |
| 详情（含 `permissions`） | `GET /items/TK-20261109-0001` |
| 时间线 / 评论 | `GET /items/{code}/timeline` · `GET /items/{code}/comments` |
| 提 ticket | `POST /items` `{"type":"ticket","title":"…","assigneeId":"<id>","description":"…","dueDate":"2026-11-20","tags":["…"]}` |
| 记 todo | `POST /items` `{"type":"todo","title":"…","priority":"P1"}` |
| 编辑 | `PATCH /items/{code}` 只传要改的字段，带上详情里的 `updatedAt` 作 `expectedUpdatedAt` |
| 改状态 | `POST /items/{code}/transition` `{"to":"resolved"}` |
| 改派 / todo 转 ticket | `POST /items/{code}/assign` / `POST /items/{code}/convert` `{"assigneeId":"<id>"}` |
| 评论 | `POST /items/{code}/comments` `{"body":"…"}` |
| 我的未读通知 | `GET /notifications?unreadOnly=true` |

## 规则（照着做能少撞 403）

- **先 GET 详情看 `permissions`** 再写：`statuses` 是当前身份能去的状态，`plan` 是能否改优先级与
  计划开始日期，`assign` 是能否改派。不在里面的别试。
- **ticket 必须有负责人**；建单后是「待定级」（priority 为 null），由负责人定级。提单人改不了优先级。
- 优先级：P0 重要且紧急 · P1 重要不紧急 · P2 紧急不重要 · P3 都不。
- 状态：open 待处理 → in_progress 处理中 → resolved 已解决（负责人）→ closed 已关闭（提单人确认）。
  todo 没有 resolved，本人直接 closed。
- **@ 人**：评论与描述里写 `@[姓名](user:<user id>)`，被 @ 的人会收到站内通知；id 从 `GET /users?q=` 拿。
- 日期是 `YYYY-MM-DD`、按北京时间；时间戳是 ISO 8601（UTC），给用户看时换成北京时间。
- 列表按 `nextCursor` 翻页：把它作为 `cursor` 再请求一次，null 表示没有更多。

## 错误

响应体 `{ code, status, message, data? }`，**把 message 原样告诉用户**（都是中文、说清了原因）：

| status | 含义 | 怎么办 |
| --- | --- | --- |
| 400 | 参数不合法，message 写了哪个字段 | 照着改 |
| 401 | 没带 key，或 key 无效 / 已撤销 / 已过期 | 让用户重新签发 |
| 403 | 看得见但不让做（只读 key 调了写接口、没这个权限、key 管理只能在浏览器） | 别重试，告诉用户原因 |
| 404 | 不存在，或看不见（别人的 todo 一律 404） | 核对单号 |
| 409 | 编辑冲突：别人刚改过 | 重新 GET 详情再改 |

key 不能签发、重新签发、撤销 key，这些只能用户自己在浏览器里做。
