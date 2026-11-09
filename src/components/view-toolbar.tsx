"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { ScheduleScope } from "~/domain/schedule";

/** 看板、日历、甘特页头右侧的视角切换 */
export function ScopeTabs<T extends string>({
	value,
	onChange,
	options,
}: {
	value: T;
	onChange: (v: T) => void;
	options: readonly { value: T; label: string }[];
}) {
	return (
		<Tabs onValueChange={(v) => onChange(v as T)} value={value}>
			<TabsList>
				{options.map((o) => (
					<TabsTrigger key={o.value} value={o.value}>
						{o.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

export const SCHEDULE_SCOPE_OPTIONS: readonly {
	value: ScheduleScope;
	label: string;
}[] = [
	{ value: "assigned", label: "我负责的" },
	{ value: "reported", label: "我提的" },
	{ value: "all", label: "全部" },
];

/** 日历、甘特的翻页：上一页 · 回到当前 · 下一页 · 当前看的是哪段 */
export function PagerBar({
	heading,
	prevLabel,
	nextLabel,
	resetLabel,
	onPrev,
	onNext,
	onReset,
	atReset,
}: {
	heading: React.ReactNode;
	prevLabel: string;
	nextLabel: string;
	resetLabel: string;
	onPrev: () => void;
	onNext: () => void;
	onReset: () => void;
	/** 已经在「当前」：回到当前的按钮置灰 */
	atReset: boolean;
}) {
	return (
		<div className="mb-4 flex items-center gap-2">
			<Button
				aria-label={prevLabel}
				onClick={onPrev}
				size="icon"
				variant="outline"
			>
				<ChevronLeft />
			</Button>
			<Button disabled={atReset} onClick={onReset} variant="outline">
				{resetLabel}
			</Button>
			<Button
				aria-label={nextLabel}
				onClick={onNext}
				size="icon"
				variant="outline"
			>
				<ChevronRight />
			</Button>
			<h2 className="ml-2 font-semibold text-lg tabular-nums sm:text-xl">
				{heading}
			</h2>
		</div>
	);
}
