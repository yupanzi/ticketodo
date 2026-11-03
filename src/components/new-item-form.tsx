"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { ItemType } from "~/domain/item";
import type { Priority } from "~/domain/priority";
import { useTRPC } from "~/trpc/react";

import { ItemFields, type ItemFieldValues } from "./item-fields";
import { type PickedUser, UserPicker } from "./user-picker";

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
		<form
			className="flex max-w-3xl flex-col gap-5"
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
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-sm">类型</span>
				<Tabs onValueChange={(v) => setType(v as ItemType)} value={type}>
					<TabsList>
						<TabsTrigger value="ticket">Ticket · 交给别人处理</TabsTrigger>
						<TabsTrigger value="todo">Todo · 自己的事</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>
			{type === "ticket" && (
				<div className="flex max-w-sm flex-col gap-1.5">
					<Label htmlFor="item-assignee">负责人（必填）</Label>
					<UserPicker
						id="item-assignee"
						onChange={setAssignee}
						value={assignee}
					/>
					<p className="text-muted-foreground text-xs">
						只能指派给登录过 ticketodo 的人。
					</p>
				</div>
			)}
			<ItemFields onChange={setFields} value={fields} />
			<div className="flex gap-2">
				<Button
					disabled={create.isPending || missingAssignee || !fields.title.trim()}
					type="submit"
				>
					{create.isPending ? "创建中…" : "创建"}
				</Button>
				<Button onClick={() => router.back()} type="button" variant="ghost">
					取消
				</Button>
			</div>
		</form>
	);
}
