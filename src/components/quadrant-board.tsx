"use client";

import {
	type Announcements,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlarmClock,
	CalendarCheck,
	CircleCheckBig,
	CircleDashed,
	GripVertical,
	Inbox,
	ListChecks,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { dueState, todayInAppTz } from "~/domain/due";
import { type BoardScope, DEFAULT_BOARD_SCOPE } from "~/domain/item-list";
import { canSetPriority } from "~/domain/policy";
import {
	PRIORITIES,
	PRIORITY_META,
	type Priority,
	UNTRIAGED_META,
} from "~/domain/priority";
import { listHref } from "~/lib/item-filters";
import { cn } from "~/lib/utils";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

import {
	DueBadge,
	PriorityBadge,
	StatusBadge,
	TagBadge,
	TodoBadge,
} from "./badges";
import { EmptyState, PageHeader } from "./layout";
import { type Me, useMe } from "./me-context";
import { UserAvatar } from "./user-avatar";

type BoardItem = RouterOutputs["item"]["board"][number];
const SCOPES: { value: BoardScope; label: string }[] = [
	{ value: "mine", label: "需要我处理" },
	{ value: "reported", label: "我提的" },
	{ value: "all", label: "全部" },
];

// ---------- 今日概览 ----------

function StatCard({
	label,
	value,
	href,
	icon: Icon,
	alert,
}: {
	label: string;
	value: number | undefined;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	/** 有数时的告警色；没有则为中性 */
	alert?: "red" | "amber";
}) {
	const hot = (value ?? 0) > 0;
	return (
		<Link
			className={cn(
				"group flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5 shadow-xs transition-colors hover:border-foreground/25 sm:px-5 sm:py-4",
				hot && alert === "red" && "border-red-200 bg-red-50/60",
				hot && alert === "amber" && "border-amber-200 bg-amber-50/60",
			)}
			href={href}
		>
			<span
				className={cn(
					// 窄屏两列放不下图标 + 文字：只留数字
					"hidden size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground sm:grid",
					hot && alert === "red" && "bg-red-600 text-white",
					hot && alert === "amber" && "bg-amber-500 text-white",
					hot && !alert && "bg-foreground text-background",
				)}
			>
				<Icon className="size-5" />
			</span>
			<span className="flex flex-col">
				<span className="text-muted-foreground text-sm">{label}</span>
				<span
					className={cn(
						"font-semibold text-2xl tabular-nums",
						!hot && "text-muted-foreground/70",
						hot && alert === "red" && "text-red-700",
						hot && alert === "amber" && "text-amber-800",
					)}
				>
					{value ?? "–"}
				</span>
			</span>
		</Link>
	);
}

function Summary() {
	const trpc = useTRPC();
	const me = useMe();
	const { data } = useQuery(trpc.item.summary.queryOptions());
	return (
		<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
			<StatCard
				alert="red"
				href={listHref({ assigneeIds: [me.id], due: "overdue" })}
				icon={AlarmClock}
				label="已逾期"
				value={data?.overdue}
			/>
			<StatCard
				alert="amber"
				href={listHref({ assigneeIds: [me.id], due: "today" })}
				icon={CalendarCheck}
				label="今天到期"
				value={data?.dueToday}
			/>
			<StatCard
				href={listHref({ reporterIds: [me.id], statuses: ["resolved"] })}
				icon={CircleCheckBig}
				label="待我确认关闭"
				value={data?.awaitingConfirmation}
			/>
			<StatCard
				href={listHref({
					assigneeIds: [me.id],
					statuses: ["open", "in_progress"],
				})}
				icon={ListChecks}
				label="我负责的进行中"
				value={data?.active}
			/>
		</div>
	);
}

// ---------- 卡片 ----------

function refOf(i: BoardItem) {
	return {
		type: i.type,
		status: i.status,
		deletedAt: i.deletedAt,
		reporterId: i.reporter.id,
		assigneeId: i.assignee.id,
	};
}

/** 卡片上只显示「另一方」：我负责的看是谁提的，我提的看是谁在做，自己的事不显示人 */
function counterpart(item: BoardItem, me: Me) {
	if (item.assignee.id !== me.id) return { user: item.assignee, role: "负责" };
	if (item.reporter.id !== me.id) return { user: item.reporter, role: "提单" };
	return null;
}

function ItemCard({ item, today }: { item: BoardItem; today: string }) {
	const me = useMe();
	// 拖动即改优先级：只有负责人与管理员（提单人能看不能拖）
	const draggable = canSetPriority(me, refOf(item));
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({ id: item.code, disabled: !draggable });
	const overdue = dueState(item.dueDate, item.status, today) === "overdue";
	const other = counterpart(item, me);
	return (
		<li
			className={cn(
				"group relative flex gap-1.5 rounded-lg border bg-card py-3 pr-4 pl-2 transition-shadow hover:border-foreground/20 hover:shadow-sm",
				overdue && "border-l-[3px] border-l-red-500",
				isDragging && "z-10 shadow-lg ring-2 ring-foreground/10",
			)}
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform) }}
		>
			{draggable ? (
				<button
					aria-label={`拖动 ${item.code} ${item.priority ? "改优先级" : "定级"}`}
					className="mt-0.5 h-fit cursor-grab rounded text-muted-foreground/40 hover:text-foreground group-hover:text-muted-foreground"
					type="button"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-4" />
				</button>
			) : (
				<span className="w-4 shrink-0" />
			)}
			<Link
				className="flex min-w-0 flex-1 flex-col gap-2.5"
				href={`/items/${item.code}`}
			>
				<p className="line-clamp-2 font-semibold text-sm leading-snug">
					{item.title}
				</p>
				<div className="flex flex-wrap items-center gap-1.5">
					<DueBadge dueDate={item.dueDate} status={item.status} today={today} />
					{item.status !== "open" && <StatusBadge status={item.status} />}
					{item.type === "todo" && <TodoBadge />}
					{item.tags.slice(0, 2).map((t) => (
						<TagBadge color={t.color} key={t.id} name={t.name} />
					))}
				</div>
				<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
					{other ? (
						<span className="inline-flex min-w-0 items-center gap-1.5">
							<UserAvatar className="size-5" user={other.user} />
							<span className="truncate">
								{other.user.name} {other.role}
							</span>
						</span>
					) : (
						<span>我自己的</span>
					)}
					<span className="shrink-0 font-mono">{item.code}</span>
				</div>
			</Link>
		</li>
	);
}

// ---------- 象限 ----------

function Quadrant({
	priority,
	items,
	today,
}: {
	priority: Priority;
	items: BoardItem[];
	today: string;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: priority });
	const meta = PRIORITY_META[priority];
	// P0 是全板唯一带色的面板：一眼先看到它
	const hot = priority === "P0";
	return (
		<section
			aria-label={`${priority} ${meta.label}`}
			className={cn(
				"flex min-h-64 flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow",
				hot && "border-red-200",
				isOver && "ring-2 ring-foreground/30",
			)}
			ref={setNodeRef}
		>
			<header
				className={cn(
					"flex items-center gap-3 border-b px-4 py-3",
					hot && "border-red-100 bg-red-50/70",
				)}
			>
				<PriorityBadge priority={priority} />
				<h2 className="font-semibold text-lg">{meta.label}</h2>
				<span className="text-muted-foreground text-sm">{meta.hint}</span>
				<span className="ml-auto rounded-full bg-muted px-2 font-medium text-muted-foreground text-xs tabular-nums">
					{items.length}
				</span>
				<Button asChild size="icon-sm" variant="ghost">
					{/* 只有 todo 由自己定级；ticket 建单是待定级 */}
					<Link
						aria-label={`在 ${priority} 新建 Todo`}
						href={`/items/new?type=todo&priority=${priority}`}
					>
						<Plus />
					</Link>
				</Button>
			</header>
			{items.length > 0 ? (
				<ul className="flex flex-col gap-2.5 p-3">
					{items.map((i) => (
						<ItemCard item={i} key={i.code} today={today} />
					))}
				</ul>
			) : (
				<EmptyState className="flex-1" icon={<Inbox />} title="这里没有事项" />
			)}
		</section>
	);
}

// ---------- 待定级 ----------

/** 新建的 ticket 先落在这里；负责人拖进下面的象限即定级。没有待定级的单就不占地方 */
function UntriagedLane({
	items,
	today,
}: {
	items: BoardItem[];
	today: string;
}) {
	if (items.length === 0) return null;
	return (
		<section
			aria-label={UNTRIAGED_META.label}
			className="mb-4 overflow-hidden rounded-xl border border-dashed bg-card shadow-xs"
		>
			<header className="flex items-center gap-3 border-b border-dashed px-4 py-3">
				<CircleDashed className="size-5 text-muted-foreground" />
				<h2 className="font-semibold text-lg">{UNTRIAGED_META.label}</h2>
				<span className="text-muted-foreground text-sm">
					负责人把卡片拖进下面的象限即定级
				</span>
				<span className="ml-auto rounded-full bg-muted px-2 font-medium text-muted-foreground text-xs tabular-nums">
					{items.length}
				</span>
			</header>
			<ul className="grid gap-2.5 p-3 md:grid-cols-2 xl:grid-cols-3">
				{items.map((i) => (
					<ItemCard item={i} key={i.code} today={today} />
				))}
			</ul>
		</section>
	);
}

// dnd-kit 的读屏提示默认是英文
const SCREEN_READER = {
	draggable:
		"按空格拿起卡片，用方向键移到别的象限，再按空格放下即改优先级（待定级的即定级）；按 Esc 取消。",
};

const zone = (id: unknown) => {
	const p = PRIORITIES.find((x) => x === id);
	return p ? `${p} ${PRIORITY_META[p].label}` : "看板外";
};

const ANNOUNCEMENTS: Announcements = {
	onDragStart: ({ active }) => `已拿起 ${active.id}`,
	onDragOver: ({ active, over }) => `${active.id} 移到 ${zone(over?.id)}`,
	onDragEnd: ({ active, over }) => `${active.id} 放到 ${zone(over?.id)}`,
	onDragCancel: ({ active }) => `已取消移动 ${active.id}`,
};

export function QuadrantBoard() {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const [scope, setScope] = useState(DEFAULT_BOARD_SCOPE);
	const boardKey = trpc.item.board.queryKey({ scope });
	const { data, isLoading } = useQuery(trpc.item.board.queryOptions({ scope }));
	const today = todayInAppTz();

	const move = useMutation(
		trpc.item.update.mutationOptions({
			// 乐观更新：先挪过去，失败再挪回来
			onMutate: async ({ code, priority }) => {
				await qc.cancelQueries({ queryKey: boardKey });
				const prev = qc.getQueryData(boardKey);
				qc.setQueryData(boardKey, (old) =>
					old?.map((i) =>
						i.code === code && priority ? { ...i, priority } : i,
					),
				);
				return { prev };
			},
			onError: (err, _vars, context) => {
				qc.setQueryData(boardKey, context?.prev);
				toast.error(err.message);
			},
			onSettled: () =>
				Promise.all([
					qc.invalidateQueries({ queryKey: trpc.item.board.pathKey() }),
					qc.invalidateQueries({ queryKey: trpc.item.summary.queryKey() }),
				]),
		}),
	);

	const sensors = useSensors(
		// 移动 6px 才算拖：点卡片仍是打开详情
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor),
	);

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		const item = data?.find((i) => i.code === active.id);
		const to = over?.id as Priority | undefined;
		if (!item || !to || to === item.priority) return;
		move.mutate({ code: item.code, priority: to });
	};

	return (
		<>
			<PageHeader
				actions={
					<Tabs onValueChange={(v) => setScope(v as BoardScope)} value={scope}>
						<TabsList>
							{SCOPES.map((s) => (
								<TabsTrigger key={s.value} value={s.value}>
									{s.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				}
				description="按「重要 × 紧急」安排手上的事；新 ticket 先进「待定级」，由负责人拖进象限"
				title="四象限"
			/>
			<Summary />
			{isLoading ? (
				<div className="grid gap-4 lg:grid-cols-2">
					{PRIORITIES.map((p) => (
						<Skeleton className="h-64 rounded-xl" key={p} />
					))}
				</div>
			) : (
				<DndContext
					accessibility={{
						announcements: ANNOUNCEMENTS,
						screenReaderInstructions: SCREEN_READER,
					}}
					onDragEnd={onDragEnd}
					sensors={sensors}
				>
					<UntriagedLane
						items={(data ?? []).filter((i) => i.priority === null)}
						today={today}
					/>
					<div className="grid gap-4 lg:grid-cols-2">
						{PRIORITIES.map((p) => (
							<Quadrant
								items={(data ?? []).filter((i) => i.priority === p)}
								key={p}
								priority={p}
								today={today}
							/>
						))}
					</div>
				</DndContext>
			)}
		</>
	);
}
