"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListTodo, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import type { ItemType } from "~/domain/item";
import type { Priority } from "~/domain/priority";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";

import { ItemFields, type ItemFieldValues } from "./item-fields";
import { Field, Panel } from "./layout";
import { type PickedUser, UserPicker } from "./user-picker";

const TYPES = [
	{
		value: "ticket",
		icon: Ticket,
		title: "Ticket",
		hint: "交给别人处理，全员可见，必须指定负责人",
	},
	{
		value: "todo",
		icon: ListTodo,
		title: "Todo",
		hint: "自己的事，只有你（和管理员）看得到",
	},
] as const;

/** 与优先级选择器同一形态：大卡片单选，原生 radio */
function TypePicker({
	value,
	onChange,
}: {
	value: ItemType;
	onChange: (t: ItemType) => void;
}) {
	const name = useId();
	return (
		<fieldset className="grid gap-2 sm:grid-cols-2">
			<legend className="sr-only">类型</legend>
			{TYPES.map((t) => (
				<label
					className={cn(
						"flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-4 py-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
						value === t.value
							? "border-foreground ring-1 ring-foreground"
							: "hover:border-foreground/30",
					)}
					key={t.value}
				>
					<input
						checked={value === t.value}
						className="sr-only"
						name={name}
						onChange={() => onChange(t.value)}
						type="radio"
						value={t.value}
					/>
					<t.icon className="mt-0.5 size-5 shrink-0" />
					<span className="flex flex-col">
						<span className="font-medium text-sm">{t.title}</span>
						<span className="text-muted-foreground text-xs">{t.hint}</span>
					</span>
				</label>
			))}
		</fieldset>
	);
}

export function NewItemForm({
	initialType,
	initialPriority,
}: {
	initialType: ItemType;
	initialPriority: Priority;
}) {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const router = useRouter();
	const [type, setType] = useState<ItemType>(initialType);
	const [assignee, setAssignee] = useState<PickedUser | null>(null);
	const [fields, setFields] = useState<ItemFieldValues>({
		title: "",
		description: "",
		priority: initialPriority,
		dueDate: "",
		tags: [],
	});

	const create = useMutation(
		trpc.item.create.mutationOptions({
			onSuccess: async ({ code }) => {
				await qc.invalidateQueries({ queryKey: trpc.item.pathKey() });
				toast.success(`已创建 ${code}`);
				router.push(`/items/${code}`);
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	// ticket 必须有负责人：不存在孤儿单
	const missingAssignee = type === "ticket" && !assignee;

	return (
		<Panel className="max-w-3xl">
			<form
				className="flex flex-col gap-6"
				onSubmit={(e) => {
					e.preventDefault();
					if (missingAssignee || !fields.title.trim()) return;
					const common = {
						title: fields.title,
						description: fields.description,
						priority: fields.priority,
						dueDate: fields.dueDate || null,
						tags: fields.tags,
					};
					create.mutate(
						type === "ticket" && assignee
							? { type, assigneeId: assignee.id, ...common }
							: { type: "todo", ...common },
					);
				}}
			>
				<Field label="类型">
					<TypePicker onChange={setType} value={type} />
				</Field>
				{type === "ticket" && (
					<Field
						className="max-w-sm"
						hint="只能指派给登录过 ticketodo 的人"
						htmlFor="item-assignee"
						label="负责人"
						required
					>
						<UserPicker
							id="item-assignee"
							onChange={setAssignee}
							value={assignee}
						/>
					</Field>
				)}
				<ItemFields onChange={setFields} value={fields} />
				<div className="flex gap-2 border-t pt-5">
					<Button
						disabled={
							create.isPending || missingAssignee || !fields.title.trim()
						}
						type="submit"
					>
						{create.isPending ? "创建中…" : "创建"}
					</Button>
					<Button onClick={() => router.back()} type="button" variant="ghost">
						取消
					</Button>
				</div>
			</form>
		</Panel>
	);
}
