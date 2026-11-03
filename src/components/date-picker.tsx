"use client";

import { CalendarDays, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { zhCN } from "react-day-picker/locale";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	addDays,
	type DayRange,
	endOfMonth,
	nextMonday,
	todayInAppTz,
} from "~/domain/due";
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

interface DayPreset<T> {
	label: string;
	value: (today: string) => T;
}

/**
 * 两种选择器共用的外壳：触发按钮 + 弹层（快捷项在上、日历在下）+ 清除按钮。
 * 清除按钮叠在触发按钮右侧：不能嵌在 <button> 里。
 */
function PickerShell<T>({
	id,
	"aria-label": ariaLabel,
	text,
	placeholder,
	presets,
	onPick,
	clearLabel,
	onClear,
	className,
	children,
}: {
	id?: string;
	"aria-label"?: string;
	/** 空串 = 未选：显示占位文字、不出清除按钮 */
	text: string;
	placeholder: string;
	presets: DayPreset<T>[];
	onPick: (v: T) => void;
	clearLabel: string;
	onClear: () => void;
	className?: string;
	children: (close: () => void) => ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const close = () => setOpen(false);
	return (
		<div className={cn("relative", className)}>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-label={ariaLabel}
						className="w-full justify-start pr-9 font-normal"
						id={id}
						variant="outline"
					>
						<CalendarDays className="text-muted-foreground" />
						{text || (
							<span className="text-muted-foreground">{placeholder}</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto gap-0 p-0">
					<div className="flex flex-wrap gap-1.5 border-b p-3">
						{presets.map((p) => (
							<Button
								key={p.label}
								onClick={() => {
									onPick(p.value(todayInAppTz()));
									close();
								}}
								size="sm"
								variant="outline"
							>
								{p.label}
							</Button>
						))}
					</div>
					{children(close)}
				</PopoverContent>
			</Popover>
			{text && (
				<Button
					aria-label={clearLabel}
					className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
					onClick={onClear}
					size="icon-xs"
					variant="ghost"
				>
					<X />
				</Button>
			)}
		</div>
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
	className,
}: {
	id?: string;
	value: string;
	onChange: (day: string) => void;
	placeholder?: string;
	className?: string;
}) {
	return (
		<PickerShell
			className={className}
			clearLabel="清除日期"
			id={id}
			onClear={() => onChange("")}
			onPick={onChange}
			placeholder={placeholder}
			presets={DUE_DAY_PRESETS}
			text={value && formatDayWeek(value)}
		>
			{(close) => (
				<AppCalendar
					autoFocus
					defaultMonth={value ? dayToDate(value) : undefined}
					mode="single"
					onSelect={(d) => {
						if (!d) return;
						onChange(dateToDay(d));
						close();
					}}
					selected={value ? dayToDate(value) : undefined}
				/>
			)}
		</PickerShell>
	);
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
	className,
	"aria-label": ariaLabel,
}: {
	value: DayRange;
	onChange: (r: DayRange) => void;
	className?: string;
	"aria-label"?: string;
}) {
	return (
		<PickerShell
			aria-label={ariaLabel}
			className={className}
			clearLabel="清除日期范围"
			onClear={() => onChange({})}
			onPick={onChange}
			placeholder="选择日期范围"
			presets={RECENT_RANGE_PRESETS}
			text={formatDayRange(value)}
		>
			{() => <DayRangeCalendar onChange={onChange} value={value} />}
		</PickerShell>
	);
}

/** 只有日历、不带触发按钮：嵌进自带弹层的筛选里用 */
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
