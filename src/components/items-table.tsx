"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
	TypeBadge,
} from "./badges";
import { useMe } from "./me-context";
import { UserChip } from "./user-avatar";

type Mine = "all" | "assigned" | "reported";

export function ItemsTable() {
	const trpc = useTRPC();
	const me = useMe();
	const [mine, setMine] = useState<Mine>("all");
	const [type, setType] = useState<ItemType | "any">("any");
	// 默认不看已关闭的
	const [statuses, setStatuses] = useState<ItemStatus[]>([
		"open",
		"in_progress",
		"resolved",
	]);
	const [priorities, setPriorities] = useState<Priority[]>([]);
	const [tagId, setTagId] = useState<string>("any");
	const [overdue, setOverdue] = useState(false);
	const [q, setQ] = useState("");
	const deferredQ = useDeferredValue(q);
	const { data: tags = [] } = useQuery(trpc.tag.list.queryOptions());

	const input = {
		type: type === "any" ? undefined : type,
		statuses: statuses.length ? statuses : undefined,
		priorities: priorities.length ? priorities : undefined,
		assigneeId: mine === "assigned" ? me.id : undefined,
		reporterId: mine === "reported" ? me.id : undefined,
		tagId: tagId === "any" ? undefined : Number(tagId),
		overdue: overdue || undefined,
		q: deferredQ.trim() || undefined,
		limit: 50,
	};
	const list = useInfiniteQuery(
		trpc.item.list.infiniteQueryOptions(input, {
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
	);
	const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
	const today = todayInAppTz();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h1 className="font-semibold text-lg">全部单子</h1>
				<Tabs onValueChange={(v) => setMine(v as Mine)} value={mine}>
					<TabsList>
						<TabsTrigger value="all">全部</TabsTrigger>
						<TabsTrigger value="assigned">我负责的</TabsTrigger>
						<TabsTrigger value="reported">我提的</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Input
					aria-label="搜索单号或标题"
					className="w-56"
					onChange={(e) => setQ(e.target.value)}
					placeholder="单号或标题"
					value={q}
				/>
				<Select
					onValueChange={(v) => setType(v as ItemType | "any")}
					value={type}
				>
					<SelectTrigger aria-label="类型" className="w-28">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">全部类型</SelectItem>
						<SelectItem value="ticket">Ticket</SelectItem>
						<SelectItem value="todo">Todo</SelectItem>
					</SelectContent>
				</Select>
				<ToggleGroup
					aria-label="状态"
					onValueChange={(v) => setStatuses(v as ItemStatus[])}
					size="sm"
					type="multiple"
					value={statuses}
					variant="outline"
				>
					{ITEM_STATUSES.map((s) => (
						<ToggleGroupItem key={s} value={s}>
							{STATUS_LABEL[s]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<ToggleGroup
					aria-label="优先级"
					onValueChange={(v) => setPriorities(v as Priority[])}
					size="sm"
					type="multiple"
					value={priorities}
					variant="outline"
				>
					{PRIORITIES.map((p) => (
						<ToggleGroupItem className="font-mono" key={p} value={p}>
							{p}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<Select onValueChange={setTagId} value={tagId}>
					<SelectTrigger aria-label="标签" className="w-32">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">全部标签</SelectItem>
						{tags.map((t) => (
							<SelectItem key={t.id} value={String(t.id)}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="flex items-center gap-1.5">
					<Checkbox
						checked={overdue}
						id="only-overdue"
						onCheckedChange={(v) => setOverdue(v === true)}
					/>
					<Label htmlFor="only-overdue">只看逾期</Label>
				</div>
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-40">单号</TableHead>
							<TableHead>标题</TableHead>
							<TableHead className="w-16">优先级</TableHead>
							<TableHead className="w-20">状态</TableHead>
							<TableHead className="w-32">负责人</TableHead>
							<TableHead className="w-32">提单人</TableHead>
							<TableHead className="w-28">期望完成</TableHead>
							<TableHead className="w-24">更新</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((i) => (
							<TableRow key={i.id}>
								<TableCell className="font-mono text-xs">
									<Link className="hover:underline" href={`/items/${i.code}`}>
										{i.code}
									</Link>
								</TableCell>
								<TableCell>
									<Link
										className="flex flex-wrap items-center gap-1.5 hover:underline"
										href={`/items/${i.code}`}
									>
										<TypeBadge type={i.type} />
										<span className="font-medium">{i.title}</span>
										{i.tags.map((t) => (
											<TagBadge color={t.color} key={t.id} name={t.name} />
										))}
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
						{!list.isLoading && rows.length === 0 && (
							<TableRow>
								<TableCell
									className="py-8 text-center text-muted-foreground"
									colSpan={8}
								>
									没有符合条件的单子
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			{list.hasNextPage && (
				<Button
					className="self-center"
					disabled={list.isFetchingNextPage}
					onClick={() => list.fetchNextPage()}
					variant="outline"
				>
					{list.isFetchingNextPage ? "加载中…" : "加载更多"}
				</Button>
			)}
		</div>
	);
}
