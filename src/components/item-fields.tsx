"use client";

import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from "~/domain/item";
import type { Priority } from "~/domain/priority";

import { DatePicker } from "./date-picker";
import { Field } from "./layout";
import { PriorityPicker } from "./priority-picker";
import { TagInput } from "./tag-input";

export interface ItemFieldValues {
	title: string;
	description: string;
	/** null = 待定级 */
	priority: Priority | null;
	/** `YYYY-MM-DD` 或空串 */
	dueDate: string;
	/** 计划开始，`YYYY-MM-DD` 或空串 */
	startDate: string;
	tags: string[];
}

/** 新建与编辑共用的字段；负责人、类型这些新建才有的由调用方自己放 */
export function ItemFields({
	value,
	onChange,
	planning,
}: {
	value: ItemFieldValues;
	onChange: (v: ItemFieldValues) => void;
	/** 优先级与计划开始由接收方定（`canPlan`）：建 ticket 与提单人编辑时不出现 */
	planning: boolean;
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
			{planning && (
				<Field
					hint="重要：影响目标、不做会有后果；紧急：有时限、拖不得"
					label="优先级"
				>
					<PriorityPicker
						onChange={(p) => set("priority", p)}
						value={value.priority}
					/>
				</Field>
			)}
			<div className="grid gap-5 sm:grid-cols-2">
				{planning && (
					<Field
						hint="甘特视图的起点；不排就从建单日算"
						htmlFor="item-start"
						label="计划开始日期"
					>
						<DatePicker
							id="item-start"
							onChange={(d) => set("startDate", d)}
							placeholder="不排"
							value={value.startDate}
						/>
					</Field>
				)}
				<Field htmlFor="item-due" label="期望完成日期">
					<DatePicker
						id="item-due"
						onChange={(d) => set("dueDate", d)}
						placeholder="不设"
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
