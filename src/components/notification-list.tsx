"use client";

import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	AlarmClock,
	AtSign,
	BellOff,
	CalendarClock,
	CircleDot,
	MessageSquare,
	UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { STATUS_LABEL } from "~/domain/item";
import { NOTIFICATION_LABEL, type NotificationKind } from "~/domain/notify";
import { formatDateTime, formatDay, formatRelative } from "~/lib/format";
import { cn } from "~/lib/utils";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

import { EmptyState, PageHeader, Panel } from "./layout";

type Notification = RouterOutputs["notification"]["list"]["items"][number];

const KIND_STYLE: Record<
	NotificationKind,
	{ icon: React.ComponentType<{ className?: string }>; className: string }
> = {
	assigned: { icon: UserPlus, className: "bg-foreground text-background" },
	status_changed: { icon: CircleDot, className: "bg-muted text-foreground" },
	commented: { icon: MessageSquare, className: "bg-muted text-foreground" },
	mentioned: { icon: AtSign, className: "bg-foreground text-background" },
	due_soon: { icon: CalendarClock, className: "bg-amber-500 text-white" },
	overdue: { icon: AlarmClock, className: "bg-red-600 text-white" },
};

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
		<>
			<PageHeader
				actions={
					<>
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
							variant="outline"
						>
							全部标为已读
						</Button>
					</>
				}
				description="被指派、状态变更、评论与 @、到期提醒"
				title="通知"
			/>
			<Panel className="max-w-4xl" flush>
				{rows.length > 0 ? (
					<ul className="divide-y">
						{rows.map((n) => {
							const style = KIND_STYLE[n.kind];
							const text = detail(n);
							return (
								<li key={n.id}>
									<button
										className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
										onClick={() => {
											if (!n.readAt) markRead.mutate({ ids: [n.id] });
											router.push(`/items/${n.payload.code}`);
										}}
										type="button"
									>
										<span
											className={cn(
												"grid size-9 shrink-0 place-items-center rounded-full",
												style.className,
											)}
										>
											<style.icon className="size-4" />
										</span>
										<span className="flex min-w-0 flex-1 flex-col gap-1">
											<span className="flex items-center gap-2">
												{!n.readAt && (
													<>
														<span
															aria-hidden
															className="size-2 shrink-0 rounded-full bg-red-600"
														/>
														<span className="sr-only">未读</span>
													</>
												)}
												<span
													className={cn(
														"truncate text-sm",
														!n.readAt && "font-semibold",
													)}
												>
													{n.payload.title}
												</span>
											</span>
											<span className="truncate text-muted-foreground text-xs">
												{NOTIFICATION_LABEL[n.kind]}
												{n.payload.actorName ? ` · ${n.payload.actorName}` : ""}
												{text ? ` · ${text}` : ""}
												<span className="ml-2 font-mono">{n.payload.code}</span>
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
							);
						})}
					</ul>
				) : (
					!list.isLoading && (
						<EmptyState
							description="有人指派给你、@ 你或单子快到期时，会出现在这里。"
							icon={<BellOff />}
							title={unreadOnly ? "没有未读通知" : "还没有通知"}
						/>
					)
				)}
				{list.hasNextPage && (
					<div className="flex justify-center border-t p-4">
						<Button
							disabled={list.isFetchingNextPage}
							onClick={() => list.fetchNextPage()}
							variant="outline"
						>
							加载更多
						</Button>
					</div>
				)}
			</Panel>
		</>
	);
}
