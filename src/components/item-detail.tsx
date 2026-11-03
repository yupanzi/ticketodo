"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { todayInAppTz } from "~/domain/due";
import { STATUS_LABEL } from "~/domain/item";
import { PRIORITY_META } from "~/domain/priority";
import { findEdge } from "~/domain/status";
import { formatDateTime, formatDay } from "~/lib/format";
import { type RouterOutputs, useTRPC } from "~/trpc/react";

import {
	DueBadge,
	PriorityBadge,
	StatusBadge,
	TagBadge,
	TypeBadge,
} from "./badges";
import { ItemActivity } from "./item-activity";
import { ItemFields, type ItemFieldValues } from "./item-fields";
import { Markdown } from "./markdown";
import { UserChip } from "./user-avatar";
import { type PickedUser, UserPicker } from "./user-picker";

type Detail = RouterOutputs["item"]["byCode"];
type Item = Detail["item"];

function useRefresh(code: string) {
	const trpc = useTRPC();
	const qc = useQueryClient();
	return () =>
		Promise.all([
			qc.invalidateQueries({ queryKey: trpc.item.pathKey() }),
			qc.invalidateQueries({ queryKey: trpc.comment.list.queryKey({ code }) }),
		]);
}

function EditDialog({ item }: { item: Item }) {
	const trpc = useTRPC();
	const refresh = useRefresh(item.code);
	const [open, setOpen] = useState(false);
	const initial = (): ItemFieldValues => ({
		title: item.title,
		description: item.description,
		priority: item.priority,
		dueDate: item.dueDate ?? "",
		tags: item.tags.map((t) => t.name),
	});
	const [fields, setFields] = useState(initial);
	const update = useMutation(
		trpc.item.update.mutationOptions({
			onSuccess: async () => {
				await refresh();
				setOpen(false);
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<Dialog
			onOpenChange={(o) => {
				if (o) setFields(initial());
				setOpen(o);
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					编辑
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>编辑 {item.code}</DialogTitle>
					<DialogDescription>
						保存时如果别人刚改过这张单，会提示你刷新后再改。
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						update.mutate({
							code: item.code,
							// 打开表单时的版本：防止覆盖别人的修改
							expectedUpdatedAt: item.updatedAt,
							title: fields.title,
							description: fields.description,
							priority: fields.priority,
							dueDate: fields.dueDate || null,
							tags: fields.tags,
						});
					}}
				>
					<ItemFields onChange={setFields} value={fields} />
					<DialogFooter>
						<Button
							disabled={update.isPending || !fields.title.trim()}
							type="submit"
						>
							保存
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** 转派（ticket）与转为 ticket（todo）共用：都是选一个人 */
function PickAssigneeDialog({
	item,
	mode,
}: {
	item: Item;
	mode: "assign" | "convert";
}) {
	const trpc = useTRPC();
	const refresh = useRefresh(item.code);
	const [open, setOpen] = useState(false);
	const [picked, setPicked] = useState<PickedUser | null>(null);
	const done = {
		onSuccess: async () => {
			await refresh();
			setOpen(false);
			setPicked(null);
		},
		onError: (err: { message: string }) => toast.error(err.message),
	};
	const assign = useMutation(trpc.item.assign.mutationOptions(done));
	const convert = useMutation(trpc.item.convert.mutationOptions(done));
	const pending = assign.isPending || convert.isPending;
	const title = mode === "assign" ? "转派给别人" : "转为 Ticket";
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{title}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{mode === "assign"
							? "转派后状态不变，新负责人与提单人都会收到通知。"
							: "转成 Ticket 后全员可见，需要指定负责人；单号不变，此前的私人记录别人看不到。"}
					</DialogDescription>
				</DialogHeader>
				<UserPicker onChange={setPicked} value={picked} />
				<DialogFooter>
					<Button
						disabled={!picked || pending}
						onClick={() => {
							if (!picked) return;
							const input = { code: item.code, assigneeId: picked.id };
							if (mode === "assign") assign.mutate(input);
							else convert.mutate(input);
						}}
					>
						确定
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteButton({ item }: { item: Item }) {
	const trpc = useTRPC();
	const router = useRouter();
	const qc = useQueryClient();
	const remove = useMutation(
		trpc.item.delete.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({ queryKey: trpc.item.pathKey() });
				toast.success(`${item.code} 已移入回收站`);
				router.push("/");
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button size="sm" variant="ghost">
					删除
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除 {item.code}？</AlertDialogTitle>
					<AlertDialogDescription>
						删除后所有人都看不到这张单，管理员可以从回收站恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={() => remove.mutate({ code: item.code })}>
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="text-sm">{children}</dd>
		</div>
	);
}

export function ItemDetail({ code }: { code: string }) {
	const trpc = useTRPC();
	const refresh = useRefresh(code);
	const { data, error, isLoading } = useQuery(
		trpc.item.byCode.queryOptions({ code }),
	);
	const transition = useMutation(
		trpc.item.transition.mutationOptions({
			onSuccess: refresh,
			onError: (err) => toast.error(err.message),
		}),
	);
	const restore = useMutation(
		trpc.item.restore.mutationOptions({
			onSuccess: refresh,
			onError: (err) => toast.error(err.message),
		}),
	);

	if (isLoading) return <Skeleton className="h-64" />;
	if (error || !data)
		return (
			<p className="text-muted-foreground">
				{error?.message ?? "这张单不存在，或你没有权限查看。"}
			</p>
		);

	const { item, permissions: can } = data;
	const today = todayInAppTz();

	return (
		<div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
			<div className="flex min-w-0 flex-col gap-6">
				<header className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="font-mono text-muted-foreground">{item.code}</span>
						<TypeBadge type={item.type} />
						<StatusBadge status={item.status} />
						<PriorityBadge priority={item.priority} withLabel />
						<DueBadge
							dueDate={item.dueDate}
							status={item.status}
							today={today}
						/>
						{item.deletedAt && (
							<span className="text-destructive text-xs">已删除</span>
						)}
					</div>
					<h1 className="font-semibold text-xl">{item.title}</h1>
					<div className="flex flex-wrap gap-2">
						{can.statuses.map((to) => (
							<Button
								disabled={transition.isPending}
								key={to}
								onClick={() => transition.mutate({ code, to })}
								size="sm"
								variant={
									to === "closed" || to === "resolved" ? "default" : "outline"
								}
							>
								{findEdge(item.type, item.status, to)?.label ??
									STATUS_LABEL[to]}
							</Button>
						))}
						{can.edit && <EditDialog item={item} />}
						{can.assign && <PickAssigneeDialog item={item} mode="assign" />}
						{can.convert && <PickAssigneeDialog item={item} mode="convert" />}
						{can.delete && <DeleteButton item={item} />}
						{can.restore && (
							<Button
								disabled={restore.isPending}
								onClick={() => restore.mutate({ code })}
								size="sm"
							>
								从回收站恢复
							</Button>
						)}
					</div>
				</header>
				<section className="rounded-md border p-4">
					{item.description.trim() ? (
						<Markdown>{item.description}</Markdown>
					) : (
						<p className="text-muted-foreground text-sm">没有描述</p>
					)}
				</section>
				<ItemActivity canComment={can.comment} code={code} />
			</div>
			<aside>
				<dl className="flex flex-col gap-4 rounded-md border p-4">
					<Field label="提单人">
						<UserChip user={item.reporter} />
					</Field>
					<Field label="负责人">
						<UserChip user={item.assignee} />
					</Field>
					<Field label="优先级">
						{item.priority} · {PRIORITY_META[item.priority].label}
					</Field>
					<Field label="期望完成">
						{item.dueDate ? formatDay(item.dueDate) : "未设置"}
					</Field>
					<Field label="标签">
						{item.tags.length ? (
							<span className="flex flex-wrap gap-1">
								{item.tags.map((t) => (
									<TagBadge color={t.color} key={t.id} name={t.name} />
								))}
							</span>
						) : (
							"无"
						)}
					</Field>
					<Field label="创建于">{formatDateTime(item.createdAt)}</Field>
					{item.resolvedAt && (
						<Field label="解决于">{formatDateTime(item.resolvedAt)}</Field>
					)}
					{item.closedAt && (
						<Field label="关闭于">{formatDateTime(item.closedAt)}</Field>
					)}
				</dl>
			</aside>
		</div>
	);
}
