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
import { GripVertical, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { todayInAppTz } from "~/domain/due";
import { canEdit } from "~/domain/policy";
import { PRIORITIES, PRIORITY_META, type Priority } from "~/domain/priority";
import { cn } from "~/lib/utils";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

import {
	DueBadge,
	PRIORITY_TONE,
	StatusBadge,
	TagBadge,
	TypeBadge,
} from "./badges";
import { useMe } from "./me-context";
import { UserChip } from "./user-avatar";

type BoardItem = RouterOutputs["item"]["board"][number];
type Scope = "mine" | "reported" | "all";

const SCOPES: { value: Scope; label: string }[] = [
	{ value: "mine", label: "需要我处理" },
	{ value: "reported", label: "我提的" },
	{ value: "all", label: "全部" },
];

function refOf(i: BoardItem) {
	return {
		type: i.type,
		status: i.status,
		deletedAt: i.deletedAt,
		reporterId: i.reporter.id,
		assigneeId: i.assignee.id,
	};
}

function ItemCard({ item, today }: { item: BoardItem; today: string }) {
	const me = useMe();
	const draggable = canEdit(me, refOf(item));
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({ id: item.code, disabled: !draggable });
	return (
		<li
			className={cn(
				"group flex gap-1 rounded-md border bg-card p-2 shadow-xs",
				isDragging && "z-10 opacity-80 shadow-lg",
			)}
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform) }}
		>
			{draggable ? (
				<button
					aria-label={`拖动 ${item.code} 改优先级`}
					className="mt-0.5 cursor-grab text-muted-foreground opacity-40 group-hover:opacity-100"
					type="button"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-4" />
				</button>
			) : (
				<span className="w-4" />
			)}
			<Link
				className="flex min-w-0 flex-1 flex-col gap-1.5"
				href={`/items/${item.code}`}
			>
				<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<span className="font-mono">{item.code}</span>
					<TypeBadge type={item.type} />
					{item.status !== "open" && <StatusBadge status={item.status} />}
				</div>
				<p className="line-clamp-2 font-medium text-sm">{item.title}</p>
				<div className="flex flex-wrap items-center gap-1.5 text-xs">
					<UserChip user={item.assignee} />
					<DueBadge dueDate={item.dueDate} status={item.status} today={today} />
					{item.tags.map((t) => (
						<TagBadge color={t.color} key={t.id} name={t.name} />
					))}
				</div>
			</Link>
		</li>
	);
}

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
	return (
		<section
			aria-label={`${priority} ${meta.label}`}
			className={cn(
				"flex min-h-48 flex-col gap-2 rounded-lg border p-3 transition-colors",
				isOver && "ring-2 ring-primary/40",
			)}
			ref={setNodeRef}
		>
			<header className="flex items-center gap-2">
				<span
					className={cn(
						"rounded border px-1.5 font-mono font-semibold text-xs",
						PRIORITY_TONE[priority],
					)}
				>
					{priority}
				</span>
				<span className="font-medium text-sm">{meta.label}</span>
				<span className="text-muted-foreground text-xs">{meta.hint}</span>
				<span className="ml-auto text-muted-foreground text-xs">
					{items.length}
				</span>
				<Link
					aria-label={`在 ${priority} 新建`}
					className="text-muted-foreground hover:text-foreground"
					href={`/items/new?priority=${priority}`}
				>
					<Plus className="size-4" />
				</Link>
			</header>
			<ul className="flex flex-col gap-2">
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
		"按空格拿起卡片，用方向键移到别的象限，再按空格放下即改优先级；按 Esc 取消。",
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
	const [scope, setScope] = useState<Scope>("mine");
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
				qc.invalidateQueries({ queryKey: trpc.item.board.pathKey() }),
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
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h1 className="font-semibold text-lg">四象限</h1>
				<Tabs onValueChange={(v) => setScope(v as Scope)} value={scope}>
					<TabsList>
						{SCOPES.map((s) => (
							<TabsTrigger key={s.value} value={s.value}>
								{s.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>
			<div className="grid grid-cols-[auto_1fr_1fr] gap-3">
				<span />
				<p className="text-center font-medium text-muted-foreground text-xs">
					紧急
				</p>
				<p className="text-center font-medium text-muted-foreground text-xs">
					不紧急
				</p>
				{isLoading ? (
					<>
						<p className="self-center text-muted-foreground text-xs [writing-mode:vertical-rl]">
							重要
						</p>
						<Skeleton className="h-48" />
						<Skeleton className="h-48" />
						<p className="self-center text-muted-foreground text-xs [writing-mode:vertical-rl]">
							不重要
						</p>
						<Skeleton className="h-48" />
						<Skeleton className="h-48" />
					</>
				) : (
					<DndContext
						accessibility={{
							announcements: ANNOUNCEMENTS,
							screenReaderInstructions: SCREEN_READER,
						}}
						onDragEnd={onDragEnd}
						sensors={sensors}
					>
						{(["重要", "不重要"] as const).map((row, r) => (
							<div className="contents" key={row}>
								<p className="self-center font-medium text-muted-foreground text-xs [writing-mode:vertical-rl]">
									{row}
								</p>
								{PRIORITIES.slice(r * 2, r * 2 + 2).map((p) => (
									<Quadrant
										items={(data ?? []).filter((i) => i.priority === p)}
										key={p}
										priority={p}
										today={today}
									/>
								))}
							</div>
						))}
					</DndContext>
				)}
			</div>
		</div>
	);
}
