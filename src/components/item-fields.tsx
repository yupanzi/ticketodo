"use client";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from "~/domain/item";
import type { Priority } from "~/domain/priority";

import { PriorityPicker } from "./priority-picker";
import { TagInput } from "./tag-input";

export interface ItemFieldValues {
	title: string;
	description: string;
	priority: Priority;
	/** `YYYY-MM-DD` 或空串 */
	dueDate: string;
	tags: string[];
}

/** 新建与编辑共用的字段；负责人、类型这些新建才有的由调用方自己放 */
export function ItemFields({
	value,
	onChange,
}: {
	value: ItemFieldValues;
	onChange: (v: ItemFieldValues) => void;
}) {
	const set = <K extends keyof ItemFieldValues>(k: K, v: ItemFieldValues[K]) =>
		onChange({ ...value, [k]: v });
	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="item-title">标题</Label>
				<Input
					autoFocus
					id="item-title"
					maxLength={TITLE_MAX_LENGTH}
					onChange={(e) => set("title", e.target.value)}
					placeholder="一句话说清楚要做什么"
					required
					value={value.title}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-sm">优先级</span>
				<PriorityPicker
					onChange={(p) => set("priority", p)}
					value={value.priority}
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="item-due">期望完成日期</Label>
					<Input
						id="item-due"
						onChange={(e) => set("dueDate", e.target.value)}
						type="date"
						value={value.dueDate}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="item-tags">标签</Label>
					<TagInput
						id="item-tags"
						onChange={(t) => set("tags", t)}
						value={value.tags}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="item-desc">描述</Label>
				<Textarea
					className="min-h-40 font-mono text-sm"
					id="item-desc"
					maxLength={DESCRIPTION_MAX_LENGTH}
					onChange={(e) => set("description", e.target.value)}
					placeholder="背景、现象、期望结果……支持 Markdown"
					value={value.description}
				/>
			</div>
		</>
	);
}
