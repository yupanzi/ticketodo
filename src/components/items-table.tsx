"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	ChevronsUpDown,
	Inbox,
	Search,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { todayInAppTz } from "~/domain/due";
import {
	ITEM_STATUSES,
	ITEM_TYPES,
	STATUS_LABEL,
	TYPE_LABEL,
} from "~/domain/item";
import {
	type ItemSort,
	type ItemSortBy,
	NATURAL_DIR,
	type SortDir,
} from "~/domain/item-list";
import { PRIORITIES, PRIORITY_META } from "~/domain/priority";
import { formatDateTime, formatRelative } from "~/lib/format";
import {
	DEFAULT_FILTERS,
	hasActiveFilters,
	type ListFilterState,
	toSearch,
} from "~/lib/item-filters";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";

import {
	DueBadge,
	PriorityBadge,
	StatusBadge,
	StatusDot,
	TagBadge,
	TodoBadge,
} from "./badges";
import { EmptyState, PageHeader, Panel } from "./layout";
import { DueFacet, FacetedFilter, PeopleFacet } from "./list-filters";
import { useMe } from "./me-context";
import { UserChip } from "./user-avatar";

type Mine = "all" | "assigned" | "reported";

const SORT_HINT: Record<ItemSortBy, Record<SortDir, string>> = {
	priority: { asc: "P0 在前", desc: "P3 在前" },
	due: { asc: "近的在前", desc: "远的在前" },
	created: { asc: "旧单在前", desc: "新单在前" },
	updated: { asc: "久未更新的在前", desc: "刚更新的在前" },
};

/** 可排序的表头：第一下按该列的自然方向，再点反过来 */
function SortHead({
	by,
	label,
	sort,
	onSort,
	className,
}: {
	by: ItemSortBy;
	label: string;
	sort: ItemSort;
	onSort: (s: ItemSort) => void;
	className?: string;
}) {
	const active = sort.by === by;
	const next: ItemSort = active
		? { by, dir: sort.dir === "asc" ? "desc" : "asc" }
		: { by, dir: NATURAL_DIR[by] };
	const Icon = !active
		? ChevronsUpDown
		: sort.dir === "asc"
			? ArrowUp
			: ArrowDown;
	return (
		<TableHead
			aria-sort={
				active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
			}
			className={className}
		>
			<button
				className={cn(
					"-mx-2 inline-flex h-8 items-center gap-1 rounded-md px-2 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
					active && "text-foreground",
				)}
				onClick={() => onSort(next)}
				title={`${active ? `当前「${SORT_HINT[by][sort.dir]}」，` : ""}点击改为「${SORT_HINT[by][next.dir]}」`}
				type="button"
			>
				{label}
				<Icon className={cn("size-3.5", !active && "opacity-40")} />
			</button>
		</TableHead>
	);
}

const sameIds = (a: string[], b: string[]) =>
	a.length === b.length && a.every((x) => b.includes(x));

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

	// 「我负责的 / 我提的」是人员筛选的快捷方式：选了别人时三个都不亮
	const mine: Mine | "" =
		!f.assigneeIds.length && !f.reporterIds.length
			? "all"
			: sameIds(f.assigneeIds, [me.id]) && !f.reporterIds.length
				? "assigned"
				: sameIds(f.reporterIds, [me.id]) && !f.assigneeIds.length
					? "reported"
					: "";
	const setMine = (m: Mine) =>
		setF((prev) => ({
			...prev,
			assigneeIds: m === "assigned" ? [me.id] : [],
			reporterIds: m === "reported" ? [me.id] : [],
		}));

	const list = useInfiniteQuery(
		trpc.item.list.infiniteQueryOptions(
			{
				types: f.types,
				statuses: f.statuses,
				priorities: f.priorities,
				tagIds: f.tagIds,
				assigneeIds: f.assigneeIds,
				reporterIds: f.reporterIds,
				due: f.due ?? undefined,
				q: deferredQ.trim() || undefined,
				sort: f.sort,
				limit: 50,
			},
			{ getNextPageParam: (last) => last.nextCursor ?? undefined },
		),
	);
	const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
	const today = todayInAppTz();
	const sortProps = { sort: f.sort, onSort: (s: ItemSort) => set("sort", s) };

	return (
		<>
			<PageHeader
				actions={
					<Tabs onValueChange={(v) => setMine(v as Mine)} value={mine}>
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
				<div className="flex flex-wrap items-center gap-2 border-b px-5 py-4">
					<div className="relative w-64">
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
					<FacetedFilter
						onChange={(v) => set("types", v)}
						options={ITEM_TYPES.map((t) => ({
							value: t,
							label: TYPE_LABEL[t],
						}))}
						selected={f.types}
						title="类型"
					/>
					<FacetedFilter
						onChange={(v) => set("statuses", v)}
						options={ITEM_STATUSES.map((s) => ({
							value: s,
							label: STATUS_LABEL[s],
							icon: <StatusDot status={s} />,
						}))}
						selected={f.statuses}
						title="状态"
					/>
					<FacetedFilter
						onChange={(v) => set("priorities", v)}
						options={PRIORITIES.map((p) => ({
							value: p,
							label: p,
							hint: PRIORITY_META[p].label,
						}))}
						selected={f.priorities}
						title="优先级"
					/>
					<FacetedFilter
						onChange={(v) => set("tagIds", v)}
						options={tags.map((t) => ({ value: t.id, label: t.name }))}
						selected={f.tagIds}
						title="标签"
					/>
					<PeopleFacet
						onChange={(v) => set("assigneeIds", v)}
						selected={f.assigneeIds}
						title="负责人"
					/>
					<PeopleFacet
						onChange={(v) => set("reporterIds", v)}
						selected={f.reporterIds}
						title="提单人"
					/>
					<DueFacet onChange={(v) => set("due", v)} value={f.due} />
					{hasActiveFilters(f) && (
						<Button
							onClick={() => setF({ ...DEFAULT_FILTERS, sort: f.sort })}
							variant="ghost"
						>
							重置
							<X />
						</Button>
					)}
				</div>
				<Table>
					<TableHeader className="bg-muted/40">
						<TableRow>
							{/* 单号就是「TK-创建日期-序号」，按单号排即按创建排，不另设创建列。标题列吃剩余宽度，
							    窄屏宁可横向滚动也不把标题挤没 */}
							<SortHead
								by="created"
								className="min-w-64"
								label="标题 / 单号"
								{...sortProps}
							/>
							<SortHead
								by="priority"
								className="w-24"
								label="优先级"
								{...sortProps}
							/>
							<TableHead className="w-24">状态</TableHead>
							<TableHead className="w-32">负责人</TableHead>
							<TableHead className="w-32">提单人</TableHead>
							<SortHead
								by="due"
								className="w-32"
								label="期望完成"
								{...sortProps}
							/>
							<SortHead
								by="updated"
								className="w-24"
								label="更新"
								{...sortProps}
							/>
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
								<TableCell
									className="text-muted-foreground text-xs"
									title={formatDateTime(i.updatedAt)}
								>
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
