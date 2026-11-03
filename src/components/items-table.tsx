"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Inbox, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { todayInAppTz } from "~/domain/due";
import {
	ITEM_STATUSES,
	type ItemStatus,
	type ItemType,
	STATUS_LABEL,
} from "~/domain/item";
import { PRIORITIES, type Priority } from "~/domain/priority";
import { formatRelative } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

import {
	DueBadge,
	PriorityBadge,
	StatusBadge,
	TagBadge,
	TodoBadge,
} from "./badges";
import { Chip } from "./chip";
import { EmptyState, PageHeader, Panel } from "./layout";
import { useMe } from "./me-context";
import { UserChip } from "./user-avatar";

export type Mine = "all" | "assigned" | "reported";

/** 列表的筛选：与地址栏双向同步，首页概览的卡片就是带着它跳过来的 */
export interface ListFilterState {
	mine: Mine;
	type: ItemType | "any";
	statuses: ItemStatus[];
	priorities: Priority[];
	tagId: string;
	overdue: boolean;
	dueToday: boolean;
	q: string;
}

/** 不看已关闭的：日常看的是还要做的事 */
export const DEFAULT_STATUSES: ItemStatus[] = [
	"open",
	"in_progress",
	"resolved",
];

function toSearch(f: ListFilterState): string {
	const p = new URLSearchParams();
	if (f.mine !== "all") p.set("mine", f.mine);
	if (f.type !== "any") p.set("type", f.type);
	if (f.statuses.join() !== DEFAULT_STATUSES.join())
		p.set("status", f.statuses.join(","));
	if (f.priorities.length) p.set("priority", f.priorities.join(","));
	if (f.tagId !== "any") p.set("tag", f.tagId);
	if (f.overdue) p.set("overdue", "1");
	if (f.dueToday) p.set("due", "today");
	if (f.q.trim()) p.set("q", f.q.trim());
	const s = p.toString();
	return s ? `?${s}` : "";
}

export function ItemsTable({ initial }: { initial: ListFilterState }) {
	const trpc = useTRPC();
	const me = useMe();
	const router = useRouter();
	const pathname = usePathname();
	const [f, setF] = useState(initial);
	const set = <K extends keyof ListFilterState>(k: K, v: ListFilterState[K]) =>
		setF((prev) => ({ ...prev, [k]: v }));
	const deferredQ = useDeferredValue(f.q);
	const { data: tags = [] } = useQuery(trpc.tag.list.queryOptions());

	// 筛选写回地址栏（replace：不刷历史记录），可直接把链接发给同事
	useEffect(() => {
		router.replace(`${pathname}${toSearch({ ...f, q: deferredQ })}`, {
			scroll: false,
		});
	}, [f, deferredQ, pathname, router]);

	const list = useInfiniteQuery(
		trpc.item.list.infiniteQueryOptions(
			{
				type: f.type === "any" ? undefined : f.type,
				statuses: f.statuses.length ? f.statuses : undefined,
				priorities: f.priorities.length ? f.priorities : undefined,
				assigneeId: f.mine === "assigned" ? me.id : undefined,
				reporterId: f.mine === "reported" ? me.id : undefined,
				tagId: f.tagId === "any" ? undefined : Number(f.tagId),
				overdue: f.overdue || undefined,
				dueToday: f.dueToday || undefined,
				q: deferredQ.trim() || undefined,
				limit: 50,
			},
			{ getNextPageParam: (last) => last.nextCursor ?? undefined },
		),
	);
	const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
	const today = todayInAppTz();

	return (
		<>
			<PageHeader
				actions={
					<Tabs onValueChange={(v) => set("mine", v as Mine)} value={f.mine}>
						<TabsList>
							<TabsTrigger value="all">全部</TabsTrigger>
							<TabsTrigger value="assigned">我负责的</TabsTrigger>
							<TabsTrigger value="reported">我提的</TabsTrigger>
						</TabsList>
					</Tabs>
				}
				description="所有你看得到的 ticket，以及你自己的 todo"
				title="全部单子"
			/>
			<Panel flush>
				<div className="flex flex-col gap-4 border-b px-5 py-4">
					<div className="flex flex-wrap items-center gap-3">
						<div className="relative w-72">
							<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								aria-label="搜索单号或标题"
								autoComplete="off"
								className="pl-9"
								name="q"
								onChange={(e) => set("q", e.target.value)}
								placeholder="搜索单号或标题"
								value={f.q}
							/>
						</div>
						<Select
							onValueChange={(v) => set("type", v as ItemType | "any")}
							value={f.type}
						>
							<SelectTrigger aria-label="类型" className="w-32">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="any">全部类型</SelectItem>
								<SelectItem value="ticket">Ticket</SelectItem>
								<SelectItem value="todo">Todo</SelectItem>
							</SelectContent>
						</Select>
						<Select onValueChange={(v) => set("tagId", v)} value={f.tagId}>
							<SelectTrigger aria-label="标签" className="w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="any">全部标签</SelectItem>
								{tags.map((t) => (
									<SelectItem key={t.id} value={String(t.id)}>
										# {t.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<label
							className="flex items-center gap-2 text-sm"
							htmlFor="only-overdue"
						>
							<Checkbox
								checked={f.overdue}
								id="only-overdue"
								onCheckedChange={(v) => set("overdue", v === true)}
							/>
							只看逾期
						</label>
						{f.dueToday && (
							<Chip tone="amber-soft">
								今天到期
								<button
									aria-label="去掉「今天到期」筛选"
									onClick={() => set("dueToday", false)}
									type="button"
								>
									<X />
								</button>
							</Chip>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">状态</span>
							<ToggleGroup
								aria-label="状态"
								onValueChange={(v) => set("statuses", v as ItemStatus[])}
								spacing={1}
								type="multiple"
								value={f.statuses}
								variant="outline"
							>
								{ITEM_STATUSES.map((s) => (
									<ToggleGroupItem key={s} value={s}>
										{STATUS_LABEL[s]}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">优先级</span>
							<ToggleGroup
								aria-label="优先级"
								onValueChange={(v) => set("priorities", v as Priority[])}
								spacing={1}
								type="multiple"
								value={f.priorities}
								variant="outline"
							>
								{PRIORITIES.map((p) => (
									<ToggleGroupItem className="font-mono" key={p} value={p}>
										{p}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
					</div>
				</div>
				<Table>
					<TableHeader className="bg-muted/40">
						<TableRow>
							<TableHead>标题</TableHead>
							<TableHead className="w-20">优先级</TableHead>
							<TableHead className="w-24">状态</TableHead>
							<TableHead className="w-36">负责人</TableHead>
							<TableHead className="w-36">提单人</TableHead>
							<TableHead className="w-32">期望完成</TableHead>
							<TableHead className="w-28">更新</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((i) => (
							<TableRow className="group" key={i.id}>
								<TableCell className="max-w-0 py-3">
									<Link
										className="flex flex-col gap-1"
										href={`/items/${i.code}`}
									>
										<span className="truncate font-medium text-sm group-hover:underline">
											{i.title}
										</span>
										<span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
											<span className="font-mono">{i.code}</span>
											{i.type === "todo" && <TodoBadge />}
											{i.tags.map((t) => (
												<TagBadge color={t.color} key={t.id} name={t.name} />
											))}
										</span>
									</Link>
								</TableCell>
								<TableCell>
									<PriorityBadge priority={i.priority} />
								</TableCell>
								<TableCell>
									<StatusBadge status={i.status} />
								</TableCell>
								<TableCell>
									<UserChip user={i.assignee} />
								</TableCell>
								<TableCell>
									<UserChip user={i.reporter} />
								</TableCell>
								<TableCell>
									<DueBadge
										dueDate={i.dueDate}
										status={i.status}
										today={today}
									/>
								</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{formatRelative(i.updatedAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				{!list.isLoading && rows.length === 0 && (
					<EmptyState
						description="换个筛选条件试试，或者新建一张单。"
						icon={<Inbox />}
						title="没有符合条件的单子"
					/>
				)}
				{list.hasNextPage && (
					<div className="flex justify-center border-t p-4">
						<Button
							disabled={list.isFetchingNextPage}
							onClick={() => list.fetchNextPage()}
							variant="outline"
						>
							{list.isFetchingNextPage ? "加载中…" : "加载更多"}
						</Button>
					</div>
				)}
			</Panel>
		</>
	);
}
