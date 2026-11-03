"use client";

import { CalendarDays, X } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { zhCN } from "react-day-picker/locale";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { addDays, endOfMonth, nextMonday, todayInAppTz } from "~/domain/due";
import { formatDayRange, formatDayWeek } from "~/lib/format";
import { cn } from "~/lib/utils";

/**
 * `YYYY-MM-DD` ⇄ 本地零点的 Date：日历只按本地年月日读写，不经时区换算，所以浏览器在哪个时区
 * 选出来的都是同一天。别换成 `new Date("YYYY-MM-DD")`：那是 UTC 零点，西半球会差一天。
 */
function dayToDate(day: string): Date {
	return new Date(`${day}T00:00:00`);
}

function dateToDay(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 全站唯一的日历：中文、周一开头、「今天」按北京时间标 */
export function AppCalendar(props: ComponentProps<typeof Calendar>) {
	return (
		<Calendar
			locale={zhCN}
			today={dayToDate(todayInAppTz())}
			weekStartsOn={1}
			{...props}
		/>
	);
}

export interface DayPreset<T> {
	label: string;
	value: (today: string) => T;
}

function Presets<T>({
	presets,
	onPick,
}: {
	presets: DayPreset<T>[];
	onPick: (v: T) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1.5 border-b p-3">
			{presets.map((p) => (
				<Button
					key={p.label}
					onClick={() => onPick(p.value(todayInAppTz()))}
					size="sm"
					variant="outline"
				>
					{p.label}
				</Button>
			))}
		</div>
	);
}

/** 清除按钮叠在触发按钮右侧：不能嵌在 <button> 里 */
function ClearButton({
	label,
	onClear,
}: {
	label: string;
	onClear: () => void;
}) {
	return (
		<Button
			aria-label={label}
			className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
			onClick={onClear}
			size="icon-xs"
			variant="ghost"
		>
			<X />
		</Button>
	);
}

const DUE_DAY_PRESETS: DayPreset<string>[] = [
	{ label: "今天", value: (t) => t },
	{ label: "明天", value: (t) => addDays(t, 1) },
	{ label: "下周一", value: nextMonday },
	{ label: "月底", value: endOfMonth },
];

/** 单个日期；值是 `YYYY-MM-DD`，空串 = 未设 */
export function DatePicker({
	id,
	value,
	onChange,
	placeholder = "选择日期",
	presets = DUE_DAY_PRESETS,
	className,
}: {
	id?: string;
	value: string;
	onChange: (day: string) => void;
	placeholder?: string;
	presets?: DayPreset<string>[];
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const pick = (day: string) => {
		onChange(day);
		setOpen(false);
	};
	return (
		<div className={cn("relative", className)}>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						className="w-full justify-start pr-9 font-normal"
						id={id}
						variant="outline"
					>
						<CalendarDays className="text-muted-foreground" />
						{value ? (
							formatDayWeek(value)
						) : (
							<span className="text-muted-foreground">{placeholder}</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto gap-0 p-0">
					<Presets onPick={pick} presets={presets} />
					<AppCalendar
						autoFocus
						defaultMonth={value ? dayToDate(value) : undefined}
						mode="single"
						onSelect={(d) => d && pick(dateToDay(d))}
						selected={value ? dayToDate(value) : undefined}
					/>
				</PopoverContent>
			</Popover>
			{value && <ClearButton label="清除日期" onClear={() => onChange("")} />}
		</div>
	);
}

export interface DayRange {
	from?: string;
	to?: string;
}

const RECENT_RANGE_PRESETS: DayPreset<DayRange>[] = [
	{ label: "今天", value: (t) => ({ from: t, to: t }) },
	{ label: "近 7 天", value: (t) => ({ from: addDays(t, -6), to: t }) },
	{ label: "近 30 天", value: (t) => ({ from: addDays(t, -29), to: t }) },
	{ label: "本月", value: (t) => ({ from: `${t.slice(0, 7)}-01`, to: t }) },
];

/** 日期范围（含两端）；空对象 = 不限 */
export function DateRangePicker({
	value,
	onChange,
	placeholder = "选择日期范围",
	presets = RECENT_RANGE_PRESETS,
	className,
	"aria-label": ariaLabel,
}: {
	value: DayRange;
	onChange: (r: DayRange) => void;
	placeholder?: string;
	presets?: DayPreset<DayRange>[];
	className?: string;
	"aria-label"?: string;
}) {
	const [open, setOpen] = useState(false);
	const set = value.from || value.to;
	return (
		<div className={cn("relative", className)}>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-label={ariaLabel}
						className="w-full justify-start pr-9 font-normal"
						variant="outline"
					>
						<CalendarDays className="text-muted-foreground" />
						{set ? (
							formatDayRange(value)
						) : (
							<span className="text-muted-foreground">{placeholder}</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto gap-0 p-0">
					<Presets
						onPick={(r) => {
							onChange(r);
							setOpen(false);
						}}
						presets={presets}
					/>
					<DayRangeCalendar onChange={onChange} value={value} />
				</PopoverContent>
			</Popover>
			{set && <ClearButton label="清除日期范围" onClear={() => onChange({})} />}
		</div>
	);
}

/** 范围日历本体：到期筛选的弹层里也用它 */
export function DayRangeCalendar({
	value,
	onChange,
	numberOfMonths = 2,
}: {
	value: DayRange;
	onChange: (r: DayRange) => void;
	numberOfMonths?: number;
}) {
	return (
		<AppCalendar
			defaultMonth={dayToDate(value.from ?? value.to ?? todayInAppTz())}
			mode="range"
			numberOfMonths={numberOfMonths}
			onSelect={(r) =>
				onChange({
					...(r?.from ? { from: dateToDay(r.from) } : {}),
					...(r?.to ? { to: dateToDay(r.to) } : {}),
				})
			}
			selected={
				value.from || value.to
					? {
							from: value.from ? dayToDate(value.from) : undefined,
							to: value.to ? dayToDate(value.to) : undefined,
						}
					: undefined
			}
		/>
	);
}
