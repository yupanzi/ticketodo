"use client";

import { useId } from "react";

import { PRIORITY_META, type Priority } from "~/domain/priority";
import { cn } from "~/lib/utils";

import { PRIORITY_TONE } from "./badges";

/** 不让人背 P 级：直接在「重要 × 紧急」的 2×2 里选。原生 radio：方向键切换、读屏都现成 */
export function PriorityPicker({
	value,
	onChange,
	disabled,
}: {
	value: Priority;
	onChange: (p: Priority) => void;
	disabled?: boolean;
}) {
	const name = useId();
	const cell = (p: Priority) => (
		<label
			className={cn(
				"flex cursor-pointer flex-col items-start rounded-md border px-3 py-2 text-sm transition-colors",
				"has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50",
				value === p ? PRIORITY_TONE[p] : "hover:bg-muted",
			)}
			key={p}
		>
			<input
				checked={value === p}
				className="sr-only"
				disabled={disabled}
				name={name}
				onChange={() => onChange(p)}
				type="radio"
				value={p}
			/>
			<span className="font-medium font-mono">{p}</span>
			<span className="text-muted-foreground text-xs">
				{PRIORITY_META[p].label} · {PRIORITY_META[p].hint}
			</span>
		</label>
	);
	return (
		<fieldset className="grid grid-cols-[auto_1fr_1fr] items-center gap-1.5">
			<legend className="sr-only">优先级（重要 × 紧急）</legend>
			<span />
			<span className="text-center text-muted-foreground text-xs">紧急</span>
			<span className="text-center text-muted-foreground text-xs">不紧急</span>
			<span className="pr-1 text-muted-foreground text-xs">重要</span>
			{cell("P0")}
			{cell("P1")}
			<span className="pr-1 text-muted-foreground text-xs">不重要</span>
			{cell("P2")}
			{cell("P3")}
		</fieldset>
	);
}
