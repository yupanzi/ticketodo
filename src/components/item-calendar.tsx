"use client";

import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { dueState, todayInAppTz } from "~/domain/due";
import { monthGrid, type ScheduleScope, shiftMonth } from "~/domain/schedule";
import { formatDayWeek } from "~/lib/format";
import { listHref } from "~/lib/item-filters";
import { calendarQueryInput, calendarSearch } from "~/lib/schedule-params";
import { useReplaceSearch } from "~/lib/use-replace-search";
import { cn } from "~/lib/utils";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

import { priorityAccentOf } from "./badges";
import { EmptyState, PageHeader, Panel } from "./layout";
import { PagerBar, SCHEDULE_SCOPE_OPTIONS, ScopeTabs } from "./view-toolbar";

type CalendarItem = RouterOutputs["item"]["calendar"][number];

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
/** 一格最多列几条，多了给「+N」去列表看那一天 */
const PER_DAY = 3;

function CalendarEntry({ item, today }: { item: CalendarItem; today: string }) {
	const overdue =
		item.dueDate !== null &&
		dueState(item.dueDate, item.status, today) === "overdue";
	return (
		<Link
			className={cn(
				"block truncate rounded-sm border-l-[3px] bg-muted/50 px-1.5 py-0.5 text-xs leading-5 hover:bg-muted",
				priorityAccentOf(item.priority).edge,
				overdue && "text-red-600",
				item.status === "resolved" && "text-muted-foreground line-through",
			)}
			href={`/items/${item.code}`}
			title={`${item.code} ${item.title}`}
		>
			{item.title}
		</Link>
	);
}

export function ItemCalendar({
	initialMonth,
	initialScope,
}: {
	initialMonth: string;
	initialScope: ScheduleScope;
}) {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const today = todayInAppTz();
	const thisMonth = today.slice(0, 7);
	const [month, setMonth] = useState(initialMonth);
	const [scope, setScope] = useState(initialScope);

	// 翻月时先留着上个月的格子，不闪骨架
	const { data = [] } = useQuery({
		...trpc.item.calendar.queryOptions(calendarQueryInput(month, scope)),
		placeholderData: keepPreviousData,
	});
	useReplaceSearch(calendarSearch(month, scope, today));
	// 前后各一个月先取着：翻月不用等
	useEffect(() => {
		for (const m of [shiftMonth(month, -1), shiftMonth(month, 1)])
			void qc.prefetchQuery(
				trpc.item.calendar.queryOptions(calendarQueryInput(m, scope)),
			);
	}, [month, scope, qc, trpc]);

	const byDay = new Map<string, CalendarItem[]>();
	for (const i of data) {
		if (!i.dueDate) continue;
		byDay.set(i.dueDate, [...(byDay.get(i.dueDate) ?? []), i]);
	}
	const days = monthGrid(month).flat();
	const daysWithItems = days.filter((d) => d.startsWith(month) && byDay.has(d));
	const [y, m] = month.split("-").map(Number);

	return (
		<>
			<PageHeader
				actions={
					<ScopeTabs
						onChange={setScope}
						options={SCHEDULE_SCOPE_OPTIONS}
						value={scope}
					/>
				}
				description="按期望完成日期排；已关闭的不显示"
				title="日历视图"
			/>
			<PagerBar
				atReset={month === thisMonth}
				heading={`${y} 年 ${m} 月`}
				nextLabel="下个月"
				onNext={() => setMonth(shiftMonth(month, 1))}
				onPrev={() => setMonth(shiftMonth(month, -1))}
				onReset={() => setMonth(thisMonth)}
				prevLabel="上个月"
				resetLabel="本月"
			/>

			{/* 宽屏：月格 */}
			<Panel className="hidden md:block" flush>
				<div className="grid grid-cols-7 border-b bg-muted/40 text-muted-foreground text-xs">
					{WEEKDAYS.map((w) => (
						<div className="px-2 py-2" key={w}>
							{w}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7">
					{days.map((day, i) => {
						const items = byDay.get(day) ?? [];
						return (
							<div
								className={cn(
									"flex min-h-28 flex-col gap-1 border-b p-1.5",
									i % 7 !== 6 && "border-r",
									i % 7 >= 5 && "bg-muted/20",
								)}
								key={day}
							>
								<span
									className={cn(
										"inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
										!day.startsWith(month) && "text-muted-foreground/60",
										day === today &&
											"bg-foreground font-semibold text-background",
									)}
								>
									{Number(day.slice(8))}
								</span>
								{items.slice(0, PER_DAY).map((item) => (
									<CalendarEntry item={item} key={item.code} today={today} />
								))}
								{items.length > PER_DAY && (
									<Link
										className="px-1.5 text-muted-foreground text-xs hover:text-foreground"
										href={listHref({ due: { from: day, to: day } })}
									>
										还有 {items.length - PER_DAY} 张
									</Link>
								)}
							</div>
						);
					})}
				</div>
			</Panel>

			{/* 窄屏：七列放不下，按天列出有单子的日子 */}
			<Panel className="md:hidden" flush>
				{daysWithItems.length === 0 ? (
					<EmptyState icon={<CalendarDays />} title="这个月没有到期的单子" />
				) : (
					daysWithItems.map((day) => (
						<section className="border-b px-4 py-3 last:border-b-0" key={day}>
							<h3
								className={cn(
									"mb-2 font-medium text-sm",
									day === today ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{formatDayWeek(day)}
								{day === today && "（今天）"}
							</h3>
							<div className="flex flex-col gap-1">
								{byDay.get(day)?.map((item) => (
									<CalendarEntry item={item} key={item.code} today={today} />
								))}
							</div>
						</section>
					))
				)}
			</Panel>
		</>
	);
}
