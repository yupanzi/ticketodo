"use client";

import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { ChartGantt, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	addDays,
	dayInAppTz,
	daysBetween,
	dueState,
	todayInAppTz,
	weekdayOf,
} from "~/domain/due";
import {
	DEFAULT_SCHEDULE_SCOPE,
	defaultGanttStart,
	GANTT_DAYS,
	ganttRange,
	ganttSpan,
	type ScheduleScope,
} from "~/domain/schedule";
import { formatDay, formatDayRange } from "~/lib/format";
import { listHref } from "~/lib/item-filters";
import { cn } from "~/lib/utils";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

import { priorityAccentOf } from "./badges";
import { SCHEDULE_SCOPE_TABS } from "./item-calendar";
import { EmptyState, PageHeader, Panel } from "./layout";

type GanttItem = RouterOutputs["item"]["gantt"][number];

/** 翻页一次挪两周：一屏 6 周，留四周上下文 */
const STEP_DAYS = 14;
/** 第 1 列是标题，日子从第 2 列起 */
const DAY_COL = 2;

function ganttSearch(start: string, scope: ScheduleScope, today: string) {
	const q = new URLSearchParams();
	if (start !== defaultGanttStart(today)) q.set("from", start);
	if (scope !== DEFAULT_SCHEDULE_SCOPE) q.set("scope", scope);
	const s = q.toString();
	return s ? `?${s}` : "";
}

function Bar({
	item,
	start,
	today,
	row,
}: {
	item: GanttItem;
	start: string;
	today: string;
	row: number;
}) {
	if (!item.dueDate) return null;
	const span = ganttSpan({
		startDate: item.startDate,
		dueDate: item.dueDate,
		createdDay: dayInAppTz(item.createdAt),
	});
	const from = daysBetween(start, span.start);
	const to = daysBetween(start, span.end);
	const first = Math.max(from, 0);
	const last = Math.min(to, GANTT_DAYS - 1);
	if (last < 0 || first > GANTT_DAYS - 1) return null;
	const overdue = dueState(item.dueDate, item.status, today) === "overdue";
	return (
		<Link
			className={cn(
				"z-10 mx-px flex h-6 items-center self-center truncate rounded-md px-2 text-xs",
				span.late
					? "bg-red-50 text-red-700 ring-1 ring-red-300 ring-inset"
					: priorityAccentOf(item.priority).fill,
				overdue && "outline-2 outline-red-500 outline-offset-1",
				item.status === "resolved" && "opacity-50",
				from < 0 && "rounded-l-none",
				to > GANTT_DAYS - 1 && "rounded-r-none",
			)}
			href={`/items/${item.code}`}
			style={{
				gridRow: row,
				gridColumn: `${DAY_COL + first} / ${DAY_COL + last + 1}`,
			}}
			title={`${item.code} ${item.title}：${formatDayRange({ from: span.start, to: span.end })}${span.late ? "（计划开始晚于期望完成）" : ""}`}
		>
			{last - first >= 3 && <span className="truncate">{item.title}</span>}
		</Link>
	);
}

export function ItemGantt({
	initialStart,
	initialScope,
}: {
	initialStart: string;
	initialScope: ScheduleScope;
}) {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const pathname = usePathname();
	const today = todayInAppTz();
	const [start, setStart] = useState(initialStart);
	const [scope, setScope] = useState(initialScope);

	// 翻页时先留着上一屏，不闪骨架
	const { data = [], isPending } = useQuery({
		...trpc.item.gantt.queryOptions({ ...ganttRange(start), scope }),
		placeholderData: keepPreviousData,
	});

	useEffect(() => {
		// 原生 replaceState：理由见 ItemsTable
		window.history.replaceState(
			null,
			"",
			`${pathname}${ganttSearch(start, scope, today)}`,
		);
		for (const s of [addDays(start, -STEP_DAYS), addDays(start, STEP_DAYS)])
			void qc.prefetchQuery(
				trpc.item.gantt.queryOptions({ ...ganttRange(s), scope }),
			);
	}, [start, scope, today, pathname, qc, trpc]);

	const days = Array.from({ length: GANTT_DAYS }, (_, i) => addDays(start, i));
	const todayIdx = daysBetween(start, today);
	const HEADER_ROWS = 2;
	const lastRow = HEADER_ROWS + Math.max(data.length, 1);

	return (
		<>
			<PageHeader
				actions={
					<Tabs
						onValueChange={(v) => setScope(v as ScheduleScope)}
						value={scope}
					>
						<TabsList>
							{SCHEDULE_SCOPE_TABS.map((s) => (
								<TabsTrigger key={s.value} value={s.value}>
									{s.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				}
				description={
					<>
						从计划开始（没排就从建单日）到期望完成；已关闭的不显示，
						<Link
							className="underline underline-offset-2 hover:text-foreground"
							href={listHref({ due: "none" })}
						>
							没设期望完成的
						</Link>
						不在图上
					</>
				}
				title="甘特图"
			/>
			<div className="mb-4 flex items-center gap-2">
				<Button
					aria-label="往前两周"
					onClick={() => setStart(addDays(start, -STEP_DAYS))}
					size="icon"
					variant="outline"
				>
					<ChevronLeft />
				</Button>
				<Button
					disabled={start === defaultGanttStart(today)}
					onClick={() => setStart(defaultGanttStart(today))}
					variant="outline"
				>
					回到本周
				</Button>
				<Button
					aria-label="往后两周"
					onClick={() => setStart(addDays(start, STEP_DAYS))}
					size="icon"
					variant="outline"
				>
					<ChevronRight />
				</Button>
				<h2 className="ml-2 font-semibold text-lg tabular-nums sm:text-xl">
					{formatDayRange(ganttRange(start))}
				</h2>
			</div>

			<Panel bodyClassName="overflow-x-auto" flush>
				<div
					className="relative grid min-w-[60rem] text-xs"
					style={{
						gridTemplateColumns: `minmax(8rem, 14rem) repeat(${GANTT_DAYS}, minmax(1.25rem, 1fr))`,
					}}
				>
					{/* 背景：周末、今天，贯穿所有行 */}
					{days.map((d, i) =>
						weekdayOf(d) === 0 || weekdayOf(d) === 6 ? (
							<div
								aria-hidden
								className="bg-muted/40"
								key={`w${d}`}
								style={{
									gridColumn: DAY_COL + i,
									gridRow: `1 / ${lastRow + 1}`,
								}}
							/>
						) : null,
					)}
					{todayIdx >= 0 && todayIdx < GANTT_DAYS && (
						<div
							aria-hidden
							className="border-x border-foreground/20 bg-foreground/5"
							style={{
								gridColumn: DAY_COL + todayIdx,
								gridRow: `1 / ${lastRow + 1}`,
							}}
						/>
					)}

					{/* 表头：周、日 */}
					{/* 固定列要不透明，横向滚动时底下的日子才不会透出来 */}
					<div
						className="sticky left-0 z-20 border-r border-b bg-card"
						style={{ gridColumn: 1, gridRow: "1 / 3" }}
					>
						<div className="size-full bg-muted/40" />
					</div>
					{days.map((d, i) =>
						i % 7 === 0 ? (
							<div
								className="border-b border-l px-1.5 py-1.5 text-muted-foreground"
								key={`h${d}`}
								style={{ gridColumn: `${DAY_COL + i} / span 7`, gridRow: 1 }}
							>
								{formatDay(d)}
							</div>
						) : null,
					)}
					{days.map((d, i) => (
						<div
							className={cn(
								"z-10 flex justify-center border-b py-1 tabular-nums",
								d === today
									? "font-semibold text-foreground"
									: "text-muted-foreground",
							)}
							key={`d${d}`}
							style={{ gridColumn: DAY_COL + i, gridRow: 2 }}
						>
							{Number(d.slice(8))}
						</div>
					))}

					{/* 每行：标题 + 条 */}
					{data.map((item, i) => {
						const row = HEADER_ROWS + 1 + i;
						return [
							<div
								aria-hidden
								className="border-b"
								key={`l${item.code}`}
								style={{ gridColumn: "1 / -1", gridRow: row }}
							/>,
							<Link
								className="sticky left-0 z-20 flex min-w-0 flex-col justify-center border-r border-b bg-card px-3 py-1.5 hover:bg-muted"
								href={`/items/${item.code}`}
								key={`t${item.code}`}
								style={{ gridColumn: 1, gridRow: row }}
							>
								<span className="truncate font-medium text-sm">
									{item.title}
								</span>
								<span className="truncate font-mono text-muted-foreground">
									{item.code}
								</span>
							</Link>,
							<Bar
								item={item}
								key={`b${item.code}`}
								row={row}
								start={start}
								today={today}
							/>,
						];
					})}
					{data.length === 0 && !isPending && (
						<div
							className="sticky left-0 z-20"
							style={{ gridColumn: "1 / -1", gridRow: HEADER_ROWS + 1 }}
						>
							<EmptyState icon={<ChartGantt />} title="这几周没有排上的单子" />
						</div>
					)}
				</div>
			</Panel>
		</>
	);
}
