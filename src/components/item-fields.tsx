"use client";

import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from "~/domain/item";
import type { Priority } from "~/domain/priority";

import { Field } from "./layout";
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
			<Field htmlFor="item-title" label="标题" required>
				<Input
					autoFocus
					id="item-title"
					maxLength={TITLE_MAX_LENGTH}
					onChange={(e) => set("title", e.target.value)}
					placeholder="一句话说清楚要做什么"
					required
					value={value.title}
				/>
			</Field>
			<Field
				hint="重要：影响目标、不做会有后果；紧急：有时限、拖不得"
				label="优先级"
			>
				<PriorityPicker
					onChange={(p) => set("priority", p)}
					value={value.priority}
				/>
			</Field>
			<div className="grid gap-5 sm:grid-cols-2">
				<Field htmlFor="item-due" label="期望完成日期">
					<Input
						id="item-due"
						onChange={(e) => set("dueDate", e.target.value)}
						type="date"
						value={value.dueDate}
					/>
				</Field>
				<Field hint="回车添加，最多 10 个" htmlFor="item-tags" label="标签">
					<TagInput
						id="item-tags"
						onChange={(t) => set("tags", t)}
						value={value.tags}
					/>
				</Field>
			</div>
			<Field
				hint="支持 Markdown：- [ ] 任务清单、表格、代码"
				htmlFor="item-desc"
				label="描述"
			>
				<Textarea
					className="min-h-44 font-mono"
					id="item-desc"
					maxLength={DESCRIPTION_MAX_LENGTH}
					onChange={(e) => set("description", e.target.value)}
					placeholder="背景、现象、期望结果……"
					value={value.description}
				/>
			</Field>
		</>
	);
}
