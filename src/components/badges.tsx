import { Bot, CalendarClock, CircleDashed } from "lucide-react";

import { dueLabel, dueState } from "~/domain/due";
import { type ItemStatus, STATUS_LABEL } from "~/domain/item";
import {
	PRIORITY_META,
	type Priority,
	UNTRIAGED_META,
} from "~/domain/priority";
import type { TagColor } from "~/domain/tag";
import { formatDay } from "~/lib/format";
import { cn } from "~/lib/utils";

import { CHIP_TONES, Chip, Dot } from "./chip";

/**
 * 优先级配色有含义：重要 = 实心（P0 / P1），紧急 = 暖色（P0 红、P2 琥珀），P3 两者都不 = 浅灰。
 */
const PRIORITY_TONE = {
	P0: "red",
	P1: "ink",
	P2: "amber-soft",
	P3: "muted",
} as const satisfies Record<Priority, string>;

export function PriorityBadge({
	priority,
	withLabel = false,
}: {
	/** null = 待定级：描边加虚线圈，不占用任何语义色 */
	priority: Priority | null;
	withLabel?: boolean;
}) {
	if (priority === null)
		return (
			<Chip title={UNTRIAGED_META.hint} tone="outline">
				<CircleDashed />
				{UNTRIAGED_META.label}
			</Chip>
		);
	const meta = PRIORITY_META[priority];
	return (
		<Chip title={`${meta.label} · ${meta.hint}`} tone={PRIORITY_TONE[priority]}>
			<span className="font-mono font-semibold">{priority}</span>
			{withLabel && <span>{meta.label}</span>}
		</Chip>
	);
}

/** 日历条目的左边线：与 PriorityBadge 同一套语义，待定级用虚线。⚠️ class 要写全：Tailwind 只认字面量 */
const PRIORITY_EDGE = {
	P0: "border-l-red-500",
	P1: "border-l-foreground",
	P2: "border-l-amber-400",
	P3: "border-l-border",
} as const satisfies Record<Priority, string>;

/** 日历左边线（edge）与甘特条（fill）。fill 直接取 PriorityBadge 用的 Chip 色调；待定级没有对应色调，用虚线框 */
export function priorityAccentOf(priority: Priority | null) {
	return priority === null
		? {
				edge: "border-dashed border-l-muted-foreground/50",
				fill: "border border-dashed border-muted-foreground/60 bg-card text-foreground/80",
			}
		: {
				edge: PRIORITY_EDGE[priority],
				fill: CHIP_TONES[PRIORITY_TONE[priority]],
			};
}

/** 象限标题等处的优先级色块（与 PriorityBadge 同色） */
export function priorityToneOf(priority: Priority) {
	return PRIORITY_TONE[priority];
}

const STATUS_STYLE: Record<
	ItemStatus,
	{ tone: "outline" | "green-soft" | "muted"; dot: string }
> = {
	open: { tone: "outline", dot: "text-muted-foreground" },
	in_progress: { tone: "outline", dot: "text-foreground" },
	resolved: { tone: "green-soft", dot: "text-emerald-600" },
	closed: { tone: "muted", dot: "text-muted-foreground/60" },
};

/** 状态的圆点单独用（筛选项里）：与 StatusBadge 同色 */
export function StatusDot({ status }: { status: ItemStatus }) {
	return <Dot className={cn("size-2", STATUS_STYLE[status].dot)} />;
}

export function StatusBadge({ status }: { status: ItemStatus }) {
	const style = STATUS_STYLE[status];
	return (
		<Chip tone={style.tone}>
			<Dot className={style.dot} />
			{STATUS_LABEL[status]}
		</Chip>
	);
}

/** 只标 todo：ticket 是常态，每张卡都写「Ticket」只是噪音 */
export function TodoBadge() {
	return <Chip tone="neutral">Todo</Chip>;
}

/** 逾期红、今明到期琥珀、其余只显示日期；已解决 / 已关闭的不再告警 */
export function DueBadge({
	dueDate,
	status,
	today,
}: {
	dueDate: string | null;
	status: ItemStatus;
	today: string;
}) {
	if (!dueDate) return null;
	const state = dueState(dueDate, status, today);
	const label =
		state === "overdue" || state === "due_soon"
			? dueLabel(dueDate, today)
			: null;
	return (
		<Chip
			title={`期望完成：${formatDay(dueDate)}`}
			tone={
				state === "overdue"
					? "red-soft"
					: state === "due_soon"
						? "amber-soft"
						: "outline"
			}
		>
			<CalendarClock />
			{label ?? formatDay(dueDate)}
		</Chip>
	);
}

const TAG_TONE: Record<TagColor, string> = {
	slate: "bg-slate-100 text-slate-700",
	red: "bg-red-50 text-red-700",
	orange: "bg-orange-50 text-orange-700",
	amber: "bg-amber-50 text-amber-800",
	green: "bg-green-50 text-green-700",
	teal: "bg-teal-50 text-teal-700",
	blue: "bg-blue-50 text-blue-700",
	violet: "bg-violet-50 text-violet-700",
	pink: "bg-pink-50 text-pink-700",
};

export function TagBadge({ name, color }: { name: string; color: TagColor }) {
	return (
		<Chip className={cn("rounded-md", TAG_TONE[color])} tone={null}>
			# {name}
		</Chip>
	);
}

/**
 * 经 API key 做的（多半是 AI 代做的）：时间线、评论、审计旁标出来，悬停看是哪个 key。
 * 不加颜色：它不是告警，只是来源。
 */
export function ApiBadge({ keyName }: { keyName: string }) {
	return (
		<Chip title={`经 API key「${keyName}」`} tone="outline">
			<Bot />
			API
		</Chip>
	);
}
