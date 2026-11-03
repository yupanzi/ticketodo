import { CalendarClock } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { dueState } from "~/domain/due";
import {
	type ItemStatus,
	type ItemType,
	STATUS_LABEL,
	TYPE_LABEL,
} from "~/domain/item";
import { PRIORITY_META, type Priority } from "~/domain/priority";
import type { TagColor } from "~/domain/tag";
import { formatDay } from "~/lib/format";
import { cn } from "~/lib/utils";

/** 四象限的配色：P0 红、P1 蓝（重要不紧急：计划）、P2 琥珀、P3 灰 */
export const PRIORITY_TONE: Record<Priority, string> = {
	P0: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
	P1: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
	P2: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
	P3: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
};

export function PriorityBadge({
	priority,
	withLabel = false,
}: {
	priority: Priority;
	withLabel?: boolean;
}) {
	return (
		<Badge
			className={cn("font-mono", PRIORITY_TONE[priority])}
			title={`${PRIORITY_META[priority].label} · ${PRIORITY_META[priority].hint}`}
			variant="outline"
		>
			{priority}
			{withLabel && (
				<span className="font-sans">{PRIORITY_META[priority].label}</span>
			)}
		</Badge>
	);
}

const STATUS_TONE: Record<ItemStatus, string> = {
	open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
	in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
	resolved:
		"bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
	closed: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: ItemStatus }) {
	return (
		<Badge className={STATUS_TONE[status]} variant="secondary">
			{STATUS_LABEL[status]}
		</Badge>
	);
}

export function TypeBadge({ type }: { type: ItemType }) {
	return (
		<Badge variant={type === "ticket" ? "outline" : "secondary"}>
			{TYPE_LABEL[type]}
		</Badge>
	);
}

/** 逾期红、今明到期琥珀；已解决 / 已关闭只显示日期 */
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
	return (
		<Badge
			className={cn(
				state === "overdue" &&
					"border-red-300 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
				state === "due_soon" &&
					"border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
			)}
			title={state === "overdue" ? "已逾期" : "期望完成日期"}
			variant="outline"
		>
			<CalendarClock />
			{state === "overdue" && "逾期 · "}
			{formatDay(dueDate)}
		</Badge>
	);
}

const TAG_TONE: Record<TagColor, string> = {
	slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
	red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
	orange:
		"bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200",
	amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
	green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
	teal: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200",
	blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
	violet:
		"bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200",
	pink: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200",
};

export function TagBadge({ name, color }: { name: string; color: TagColor }) {
	return (
		<Badge className={TAG_TONE[color]} variant="secondary">
			{name}
		</Badge>
	);
}
