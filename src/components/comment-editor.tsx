"use client";

import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { formatMention } from "~/domain/mention";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";

import { UserChip } from "./user-avatar";

// 光标前紧挨着的 @查询词（@ 前是行首或空白）
const MENTION_QUERY = /(?:^|\s)@([^\s@[\]]{0,20})$/;

/** 评论框：输入 @ 弹出人选，选中后插入 `@[名字](user:id)`；Ctrl/⌘ + Enter 提交 */
export function CommentEditor({
	initial = "",
	submitLabel = "评论",
	pending,
	onSubmit,
	onCancel,
}: {
	initial?: string;
	submitLabel?: string;
	pending?: boolean;
	onSubmit: (body: string) => Promise<unknown> | undefined;
	onCancel?: () => void;
}) {
	const trpc = useTRPC();
	const ref = useRef<HTMLTextAreaElement>(null);
	const [body, setBody] = useState(initial);
	const [query, setQuery] = useState<string | null>(null);
	const [active, setActive] = useState(0);
	const deferred = useDeferredValue(query ?? "");
	const { data: users = [] } = useQuery(
		trpc.user.search.queryOptions(
			{ q: deferred, limit: 8 },
			{ enabled: query !== null },
		),
	);
	const open = query !== null && users.length > 0;

	const sync = (text: string, caret: number) => {
		const m = MENTION_QUERY.exec(text.slice(0, caret));
		setQuery(m ? (m[1] ?? "") : null);
		setActive(0);
	};

	const pick = (u: { id: string; name: string }) => {
		const el = ref.current;
		if (!el || query === null) return;
		const caret = el.selectionStart;
		const start = caret - query.length - 1;
		const token = `${formatMention(u.name, u.id)} `;
		const next = body.slice(0, start) + token + body.slice(caret);
		setBody(next);
		setQuery(null);
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + token.length, start + token.length);
		});
	};

	const submit = async () => {
		if (!body.trim() || pending) return;
		await onSubmit(body.trim());
		if (!initial) setBody("");
	};

	return (
		<div className="relative flex flex-col gap-2">
			<Textarea
				aria-label="评论"
				className="min-h-24 bg-card"
				name="body"
				onChange={(e) => {
					setBody(e.target.value);
					sync(e.target.value, e.target.selectionStart);
				}}
				onKeyDown={(e) => {
					if (open) {
						if (e.key === "ArrowDown" || e.key === "ArrowUp") {
							e.preventDefault();
							const step = e.key === "ArrowDown" ? 1 : -1;
							setActive((i) => (i + step + users.length) % users.length);
							return;
						}
						if (e.key === "Enter" || e.key === "Tab") {
							e.preventDefault();
							const u = users[active];
							if (u) pick(u);
							return;
						}
						if (e.key === "Escape") {
							setQuery(null);
							return;
						}
					}
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						void submit();
					}
				}}
				placeholder="写点什么…支持 Markdown，输入 @ 提到某人"
				ref={ref}
				value={body}
			/>
			{open && (
				<div
					className="absolute top-full left-0 z-10 mt-1 flex w-64 flex-col rounded-md border bg-popover p-1 shadow-md"
					role="listbox"
				>
					{users.map((u, i) => (
						<button
							aria-selected={i === active}
							className={cn(
								"flex w-full items-center rounded px-2 py-1 text-left text-sm",
								i === active ? "bg-accent" : "hover:bg-muted",
							)}
							key={u.id}
							onClick={() => pick(u)}
							// 不抢焦点：点选后光标还在输入框里（键盘选择走输入框的方向键）
							onMouseDown={(e) => e.preventDefault()}
							role="option"
							tabIndex={-1}
							type="button"
						>
							<UserChip user={u} />
						</button>
					))}
				</div>
			)}
			<div className="flex justify-end gap-2">
				{onCancel && (
					<Button onClick={onCancel} type="button" variant="ghost">
						取消
					</Button>
				)}
				<Button
					disabled={!body.trim() || pending}
					onClick={() => void submit()}
					type="button"
				>
					{submitLabel}
				</Button>
			</div>
		</div>
	);
}
