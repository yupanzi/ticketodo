"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import type { AuditChanges } from "~/domain/audit";
import { type ItemStatus, STATUS_LABEL } from "~/domain/item";
import { formatDateTime, formatDay, formatRelative } from "~/lib/format";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

import { CommentEditor } from "./comment-editor";
import { Markdown } from "./markdown";
import { UserAvatar } from "./user-avatar";

type Event = RouterOutputs["item"]["timeline"][number];
type Comment = RouterOutputs["comment"]["list"][number];

const FIELD_LABEL: Record<string, string> = {
	title: "标题",
	description: "描述",
	priority: "优先级",
	dueDate: "期望完成日期",
	tags: "标签",
};

type Named = { id: string | number; name?: string };

function nameOf(v: unknown): string {
	return (v as Named | null)?.name ?? "（无）";
}

function tagNames(v: unknown): string[] {
	return Array.isArray(v)
		? (v as Named[]).map((t) => t.name ?? String(t.id))
		: [];
}

function describeChange(field: string, c: AuditChanges[string]): string {
	const label = FIELD_LABEL[field] ?? field;
	if (field === "description") return "修改了描述";
	if (field === "tags") {
		const from = tagNames(c.from);
		const to = tagNames(c.to);
		const added = to.filter((t) => !from.includes(t));
		const removed = from.filter((t) => !to.includes(t));
		return [
			added.length ? `添加标签 ${added.join("、")}` : "",
			removed.length ? `移除标签 ${removed.join("、")}` : "",
		]
			.filter(Boolean)
			.join("，");
	}
	if (field === "dueDate") {
		const fmt = (d: unknown) =>
			typeof d === "string" ? formatDay(d) : "（无）";
		return `把${label}从「${fmt(c.from)}」改为「${fmt(c.to)}」`;
	}
	return `把${label}从「${String(c.from ?? "（无）")}」改为「${String(c.to ?? "（无）")}」`;
}

/** 审计动作 → 一句人话 */
function describe(e: Event): string {
	const ch = e.changes ?? {};
	switch (e.action) {
		case "item.create":
			return "创建了这张单";
		case "item.update":
			return Object.entries(ch)
				.map(([f, c]) => describeChange(f, c))
				.join("；");
		case "item.status": {
			const s = ch.status;
			const tail = s
				? `（${STATUS_LABEL[s.from as ItemStatus]} → ${STATUS_LABEL[s.to as ItemStatus]}）`
				: "";
			return `${e.summary ?? "改了状态"}${tail}`;
		}
		case "item.assign":
			return `把负责人从 ${nameOf(ch.assignee?.from)} 转给 ${nameOf(ch.assignee?.to)}`;
		case "item.convert":
			return `把 Todo 转为 Ticket，负责人 ${nameOf(ch.assignee?.to)}`;
		case "item.delete":
			return "删除了这张单";
		case "item.restore":
			return "从回收站恢复了这张单";
		default:
			return e.summary ?? e.action;
	}
}

function CommentBlock({ c, code }: { c: Comment; code: string }) {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const [editing, setEditing] = useState(false);
	const refresh = () =>
		qc.invalidateQueries({ queryKey: trpc.comment.list.queryKey({ code }) });
	const edit = useMutation(
		trpc.comment.edit.mutationOptions({
			onSuccess: async () => {
				await refresh();
				setEditing(false);
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	const remove = useMutation(
		trpc.comment.delete.mutationOptions({
			onSuccess: refresh,
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<li className="flex gap-3">
			<UserAvatar className="mt-0.5 size-7" user={c.author} />
			<div className="flex min-w-0 flex-1 flex-col gap-1 rounded-md border px-3 py-2">
				<div className="flex items-center gap-2 text-xs">
					<span className="font-medium text-sm">{c.author.name}</span>
					<time
						className="text-muted-foreground"
						dateTime={c.createdAt.toISOString()}
						title={formatDateTime(c.createdAt)}
					>
						{formatRelative(c.createdAt)}
					</time>
					{c.updatedAt.getTime() - c.createdAt.getTime() > 1000 &&
						!c.deletedAt && (
							<span className="text-muted-foreground">（已编辑）</span>
						)}
					<span className="ml-auto flex gap-1">
						{c.canEdit && !editing && (
							<Button
								onClick={() => setEditing(true)}
								size="xs"
								variant="ghost"
							>
								编辑
							</Button>
						)}
						{c.canDelete && (
							<Button
								disabled={remove.isPending}
								onClick={() => {
									if (confirm("删除这条评论？")) remove.mutate({ id: c.id });
								}}
								size="xs"
								variant="ghost"
							>
								删除
							</Button>
						)}
					</span>
				</div>
				{c.deletedAt || c.body === null ? (
					<p className="text-muted-foreground text-sm italic">该评论已删除</p>
				) : editing ? (
					<CommentEditor
						initial={c.body}
						onCancel={() => setEditing(false)}
						onSubmit={(body) => edit.mutateAsync({ id: c.id, body })}
						pending={edit.isPending}
						submitLabel="保存"
					/>
				) : (
					<Markdown>{c.body}</Markdown>
				)}
			</div>
		</li>
	);
}

/** 时间线（审计里的字段级变更）与评论按时间合成一条流 */
export function ItemActivity({
	code,
	canComment,
}: {
	code: string;
	canComment: boolean;
}) {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const events = useQuery(trpc.item.timeline.queryOptions({ code }));
	const comments = useQuery(trpc.comment.list.queryOptions({ code }));
	const add = useMutation(
		trpc.comment.add.mutationOptions({
			onSuccess: () =>
				qc.invalidateQueries({
					queryKey: trpc.comment.list.queryKey({ code }),
				}),
			onError: (err) => toast.error(err.message),
		}),
	);

	if (events.isLoading || comments.isLoading)
		return <Skeleton className="h-32" />;

	const stream = [
		...(events.data ?? []).map((e) => ({ at: e.at, key: `e${e.id}`, e })),
		...(comments.data ?? []).map((c) => ({
			at: c.createdAt,
			key: `c${c.id}`,
			c,
		})),
	].sort((a, b) => a.at.getTime() - b.at.getTime());

	return (
		<section className="flex flex-col gap-4">
			<h2 className="font-medium text-sm">动态</h2>
			<ol className="flex flex-col gap-3">
				{stream.map((s) =>
					"c" in s ? (
						<CommentBlock c={s.c} code={code} key={s.key} />
					) : (
						<li
							className="flex items-baseline gap-2 pl-10 text-muted-foreground text-xs"
							key={s.key}
						>
							<span className="font-medium text-foreground">
								{s.e.actorName ?? "系统"}
							</span>
							<span>{describe(s.e)}</span>
							<time
								className="ml-auto shrink-0"
								dateTime={s.e.at.toISOString()}
								title={formatDateTime(s.e.at)}
							>
								{formatRelative(s.e.at)}
							</time>
						</li>
					),
				)}
			</ol>
			{canComment && (
				<CommentEditor
					onSubmit={(body) => add.mutateAsync({ code, body })}
					pending={add.isPending}
				/>
			)}
		</section>
	);
}
