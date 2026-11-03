"use client";

import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { STATUS_LABEL } from "~/domain/item";
import { NOTIFICATION_LABEL } from "~/domain/notify";
import { formatDateTime, formatDay, formatRelative } from "~/lib/format";
import { cn } from "~/lib/utils";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

type Notification = RouterOutputs["notification"]["list"]["items"][number];

function detail(n: Notification): string | null {
	const p = n.payload;
	if (p.status)
		return `${STATUS_LABEL[p.status.from]} → ${STATUS_LABEL[p.status.to]}`;
	if (p.excerpt) return p.excerpt;
	if (p.dueDate) return `期望完成：${formatDay(p.dueDate)}`;
	return null;
}

export function NotificationList() {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const router = useRouter();
	const [unreadOnly, setUnreadOnly] = useState(false);
	const list = useInfiniteQuery(
		trpc.notification.list.infiniteQueryOptions(
			{ unreadOnly, limit: 30 },
			{ getNextPageParam: (last) => last.nextCursor ?? undefined },
		),
	);
	const refresh = () =>
		qc.invalidateQueries({ queryKey: trpc.notification.pathKey() });
	const markRead = useMutation(
		trpc.notification.markRead.mutationOptions({ onSuccess: refresh }),
	);
	const markAll = useMutation(
		trpc.notification.markAllRead.mutationOptions({ onSuccess: refresh }),
	);
	const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h1 className="font-semibold text-lg">通知</h1>
				<div className="flex items-center gap-2">
					<Tabs
						onValueChange={(v) => setUnreadOnly(v === "unread")}
						value={unreadOnly ? "unread" : "all"}
					>
						<TabsList>
							<TabsTrigger value="all">全部</TabsTrigger>
							<TabsTrigger value="unread">未读</TabsTrigger>
						</TabsList>
					</Tabs>
					<Button
						disabled={markAll.isPending}
						onClick={() => markAll.mutate()}
						size="sm"
						variant="outline"
					>
						全部标为已读
					</Button>
				</div>
			</div>
			<ul className="flex flex-col divide-y rounded-md border">
				{rows.map((n) => (
					<li key={n.id}>
						<button
							className={cn(
								"flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50",
								!n.readAt && "bg-primary/5",
							)}
							onClick={() => {
								if (!n.readAt) markRead.mutate({ ids: [n.id] });
								router.push(`/items/${n.payload.code}`);
							}}
							type="button"
						>
							<span
								aria-hidden
								className={cn(
									"mt-1.5 size-2 shrink-0 rounded-full",
									n.readAt ? "bg-transparent" : "bg-primary",
								)}
							/>
							{!n.readAt && <span className="sr-only">未读</span>}
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="flex flex-wrap items-center gap-2 text-sm">
									<Badge variant="secondary">
										{NOTIFICATION_LABEL[n.kind]}
									</Badge>
									<span className="font-mono text-muted-foreground text-xs">
										{n.payload.code}
									</span>
									<span className="truncate font-medium">
										{n.payload.title}
									</span>
								</span>
								<span className="truncate text-muted-foreground text-xs">
									{n.payload.actorName ? `${n.payload.actorName} · ` : ""}
									{detail(n)}
								</span>
							</span>
							<time
								className="shrink-0 text-muted-foreground text-xs"
								dateTime={n.createdAt.toISOString()}
								title={formatDateTime(n.createdAt)}
							>
								{formatRelative(n.createdAt)}
							</time>
						</button>
					</li>
				))}
				{!list.isLoading && rows.length === 0 && (
					<li className="px-4 py-8 text-center text-muted-foreground text-sm">
						没有通知
					</li>
				)}
			</ul>
			{list.hasNextPage && (
				<Button
					className="self-center"
					disabled={list.isFetchingNextPage}
					onClick={() => list.fetchNextPage()}
					variant="outline"
				>
					加载更多
				</Button>
			)}
		</div>
	);
}
