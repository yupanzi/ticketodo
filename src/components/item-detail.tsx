"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowRightLeft,
	Grid2x2,
	MoreHorizontal,
	Pencil,
	RotateCcw,
	Ticket,
	Trash2,
} from "lucide-react";
import Link from "next/link";
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
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { todayInAppTz } from "~/domain/due";
import { type ItemStatus, type ItemType, STATUS_LABEL } from "~/domain/item";
import type { Priority } from "~/domain/priority";
import { findEdge } from "~/domain/status";
import { formatDateTime, formatDay } from "~/lib/format";
import { type ApiOutputs, orpc } from "~/orpc/client";

import {
	DueBadge,
	PriorityBadge,
	StatusBadge,
	TagBadge,
	TodoBadge,
} from "./badges";
import { Chip } from "./chip";
import { ItemActivity } from "./item-activity";
import { useItemCache } from "./item-cache";
import { ItemFields, type ItemFieldValues } from "./item-fields";
import {
	EmptyState,
	PageHeader,
	Panel,
	Property,
	PropertyList,
} from "./layout";
import { Markdown } from "./markdown";
import { PriorityPicker } from "./priority-picker";
import { UserChip } from "./user-avatar";
import { type PickedUser, UserPicker } from "./user-picker";

type Detail = ApiOutputs["item"]["get"];
type Item = Detail["item"];

/**
 * 状态按钮的分量：「往前推进」的那一步是主按钮（全页只有一个），退回 / 打回是次要，撤回最弱。
 */
type Emphasis = "primary" | "secondary" | "quiet";

function emphasisOf(
	type: ItemType,
	from: ItemStatus,
	to: ItemStatus,
): Emphasis {
	if (type === "ticket" && to === "closed" && from !== "resolved")
		return "quiet";
	const forward =
		(from === "open" && to === "in_progress") ||
		to === "resolved" ||
		(from === "resolved" && to === "closed") ||
		(type === "todo" && to === "closed") ||
		(from === "closed" && to === "open");
	return forward ? "primary" : "secondary";
}

function StatusActions({ detail }: { detail: Detail }) {
	const cache = useItemCache();
	const { item, permissions } = detail;
	const statuses = permissions.statuses;
	const transition = useMutation(
		orpc.item.transition.mutationOptions({
			// 状态是最常点的：先改界面，失败回滚
			onMutate: ({ to }) => cache.optimisticStatus(detail, to),
			onSuccess: cache.apply,
			onError: (err, _vars, rollback) => {
				rollback?.();
				toast.error(err.message);
			},
		}),
	);
	// 全页只留一个主按钮：第一个「往前推进」的
	const primary = statuses.find(
		(to) => emphasisOf(item.type, item.status, to) === "primary",
	);
	return statuses.map((to) => {
		const base = emphasisOf(item.type, item.status, to);
		const emphasis = base === "primary" && to !== primary ? "secondary" : base;
		return (
			<Button
				disabled={transition.isPending}
				key={to}
				onClick={() => transition.mutate({ code: item.code, to })}
				variant={
					emphasis === "primary"
						? "default"
						: emphasis === "quiet"
							? "ghost"
							: "outline"
				}
			>
				{findEdge(item.type, item.status, to)?.label ?? STATUS_LABEL[to]}
			</Button>
		);
	});
}

function EditDialog({
	item,
	canPlan,
	open,
	onOpenChange,
}: {
	item: Item;
	/** 提单人能编辑但不能定级、排期：不显示，也不提交 */
	canPlan: boolean;
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	const cache = useItemCache();
	const initial = (): ItemFieldValues => ({
		title: item.title,
		description: item.description,
		priority: item.priority,
		dueDate: item.dueDate ?? "",
		startDate: item.startDate ?? "",
		tags: item.tags.map((t) => t.name),
	});
	const [fields, setFields] = useState(initial);
	const update = useMutation(
		orpc.item.update.mutationOptions({
			onSuccess: (detail) => {
				cache.apply(detail);
				onOpenChange(false);
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<Dialog
			onOpenChange={(o) => {
				if (o) setFields(initial());
				onOpenChange(o);
			}}
			open={open}
		>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>编辑 {item.code}</DialogTitle>
					<DialogDescription>
						保存时如果别人刚改过这张单，会提示你刷新后再改。
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-5"
					onSubmit={(e) => {
						e.preventDefault();
						update.mutate({
							code: item.code,
							// 打开表单时的版本：防止覆盖别人的修改
							expectedUpdatedAt: item.updatedAt,
							title: fields.title,
							description: fields.description,
							// 提单人看不到这两项、值就是原值：服务端只在真变了时判 canPlan
							priority: fields.priority ?? undefined,
							startDate: fields.startDate || null,
							dueDate: fields.dueDate || null,
							tags: fields.tags,
						});
					}}
				>
					<ItemFields onChange={setFields} planning={canPlan} value={fields} />
					<DialogFooter>
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="ghost"
						>
							取消
						</Button>
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

/** 负责人给待定级的 ticket 定级：只有优先级这一项，比打开整个编辑表单快 */
function TriageDialog({
	item,
	open,
	onOpenChange,
}: {
	item: Item;
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	const cache = useItemCache();
	const [picked, setPicked] = useState<Priority | null>(null);
	const triage = useMutation(
		orpc.item.update.mutationOptions({
			onSuccess: (detail) => {
				cache.apply(detail);
				onOpenChange(false);
				setPicked(null);
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>给 {item.code} 定级</DialogTitle>
					<DialogDescription>
						按「重要 × 紧急」判断；定级后提单人能在看板对应象限里看到它。
					</DialogDescription>
				</DialogHeader>
				<PriorityPicker onChange={setPicked} value={picked} />
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="ghost">
						取消
					</Button>
					<Button
						disabled={!picked || triage.isPending}
						onClick={() => {
							if (picked) triage.mutate({ code: item.code, priority: picked });
						}}
					>
						确定
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** 转派（ticket）与转为 ticket（todo）共用：都是选一个人 */
function PickAssigneeDialog({
	item,
	mode,
	open,
	onOpenChange,
}: {
	item: Item;
	mode: "assign" | "convert";
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	const cache = useItemCache();
	const [picked, setPicked] = useState<PickedUser | null>(null);
	const done = {
		onSuccess: (detail: Detail) => {
			cache.apply(detail);
			onOpenChange(false);
			setPicked(null);
		},
		onError: (err: { message: string }) => toast.error(err.message),
	};
	const assign = useMutation(orpc.item.assign.mutationOptions(done));
	const convert = useMutation(orpc.item.convert.mutationOptions(done));
	const pending = assign.isPending || convert.isPending;
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{mode === "assign" ? "转派给别人" : "转为 Ticket"}
					</DialogTitle>
					<DialogDescription>
						{mode === "assign"
							? "转派后状态不变，新负责人与提单人都会收到通知。"
							: "转成 Ticket 后全员可见，需要指定负责人；单号不变，此前的私人记录别人看不到。"}
					</DialogDescription>
				</DialogHeader>
				<UserPicker onChange={setPicked} value={picked} />
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="ghost">
						取消
					</Button>
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

function DeleteDialog({
	item,
	open,
	onOpenChange,
}: {
	item: Item;
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	const router = useRouter();
	const qc = useQueryClient();
	const remove = useMutation(
		orpc.item.delete.mutationOptions({
			onSuccess: () => {
				void qc.invalidateQueries({ queryKey: orpc.item.key() });
				toast.success(`${item.code} 已删除`);
				router.push("/");
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除 {item.code}？</AlertDialogTitle>
					<AlertDialogDescription>
						删除后所有人都看不到这张单，管理员可以在「已删单子」里恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction
						className="bg-red-600 text-white hover:bg-red-700"
						onClick={() => remove.mutate({ code: item.code })}
					>
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

type DialogKind = "edit" | "triage" | "assign" | "convert" | "delete" | null;

export function ItemDetail({ code }: { code: string }) {
	const cache = useItemCache();
	const [dialog, setDialog] = useState<DialogKind>(null);
	const { data, error, isLoading } = useQuery(
		orpc.item.get.queryOptions({ input: { code } }),
	);
	const restore = useMutation(
		orpc.item.restore.mutationOptions({
			onSuccess: cache.apply,
			onError: (err) => toast.error(err.message),
		}),
	);

	if (isLoading)
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-24 rounded-xl" />
				<Skeleton className="h-64 rounded-xl" />
			</div>
		);
	if (error || !data)
		return (
			<Panel>
				<EmptyState
					action={
						<Button asChild variant="outline">
							<Link href="/items">回到全部单子</Link>
						</Button>
					}
					description={error?.message}
					title="这张单不存在，或你没有权限查看"
				/>
			</Panel>
		);

	const { item, permissions: can } = data;
	const today = todayInAppTz();
	const onOpenChange = (o: boolean) => {
		if (!o) setDialog(null);
	};

	return (
		<>
			<PageHeader
				eyebrow={
					<>
						<Link className="hover:text-foreground" href="/items">
							全部单子
						</Link>
						<span>/</span>
						<span className="font-mono">{item.code}</span>
					</>
				}
				size="detail"
				title={item.title}
			>
				<StatusBadge status={item.status} />
				<PriorityBadge priority={item.priority} withLabel />
				<DueBadge dueDate={item.dueDate} status={item.status} today={today} />
				{item.type === "todo" && <TodoBadge />}
				{item.deletedAt && <Chip tone="red-soft">已删除</Chip>}
			</PageHeader>

			<div className="mb-6 flex flex-wrap items-center gap-2">
				<StatusActions detail={data} />
				{can.statuses.length > 0 && (can.edit || can.assign || can.convert) && (
					<span aria-hidden className="mx-1 h-6 w-px bg-border" />
				)}
				{item.priority === null && can.plan && (
					<Button onClick={() => setDialog("triage")} variant="outline">
						<Grid2x2 />
						定级
					</Button>
				)}
				{can.edit && (
					<Button onClick={() => setDialog("edit")} variant="outline">
						<Pencil />
						编辑
					</Button>
				)}
				{can.assign && (
					<Button onClick={() => setDialog("assign")} variant="outline">
						<ArrowRightLeft />
						转派
					</Button>
				)}
				{can.convert && (
					<Button onClick={() => setDialog("convert")} variant="outline">
						<Ticket />
						转为 Ticket
					</Button>
				)}
				{can.restore && (
					<Button
						disabled={restore.isPending}
						onClick={() => restore.mutate({ code })}
					>
						<RotateCcw />
						恢复这张单
					</Button>
				)}
				{can.delete && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button aria-label="更多操作" size="icon" variant="ghost">
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuItem
								className="text-red-600 focus:text-red-700"
								onSelect={() => setDialog("delete")}
							>
								<Trash2 />
								删除
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="flex min-w-0 flex-col gap-6">
					<Panel title="描述">
						{item.description.trim() ? (
							<Markdown>{item.description}</Markdown>
						) : (
							<p className="text-muted-foreground">没有描述</p>
						)}
					</Panel>
					<Panel flush title="动态">
						<ItemActivity canComment={can.comment} code={code} />
					</Panel>
				</div>
				<Panel className="lg:sticky lg:top-8" title="详情">
					<PropertyList>
						<Property label="提单人">
							<UserChip user={item.reporter} />
						</Property>
						<Property label="负责人">
							<UserChip user={item.assignee} />
						</Property>
						<Property label="优先级">
							<PriorityBadge priority={item.priority} withLabel />
						</Property>
						<Property label="计划开始">
							{item.startDate ? formatDay(item.startDate) : "未排"}
						</Property>
						<Property label="期望完成">
							{item.dueDate ? formatDay(item.dueDate) : "未设置"}
						</Property>
						<Property label="标签">
							{item.tags.length ? (
								<span className="flex flex-wrap justify-end gap-1">
									{item.tags.map((t) => (
										<TagBadge color={t.color} key={t.id} name={t.name} />
									))}
								</span>
							) : (
								"无"
							)}
						</Property>
						<Property label="创建于">{formatDateTime(item.createdAt)}</Property>
						{item.resolvedAt && (
							<Property label="解决于">
								{formatDateTime(item.resolvedAt)}
							</Property>
						)}
						{item.closedAt && (
							<Property label="关闭于">
								{formatDateTime(item.closedAt)}
							</Property>
						)}
					</PropertyList>
				</Panel>
			</div>

			{can.edit && (
				<EditDialog
					canPlan={can.plan}
					item={item}
					onOpenChange={onOpenChange}
					open={dialog === "edit"}
				/>
			)}
			{can.plan && (
				<TriageDialog
					item={item}
					onOpenChange={onOpenChange}
					open={dialog === "triage"}
				/>
			)}
			{(can.assign || can.convert) && (
				<PickAssigneeDialog
					item={item}
					mode={dialog === "convert" ? "convert" : "assign"}
					onOpenChange={onOpenChange}
					open={dialog === "assign" || dialog === "convert"}
				/>
			)}
			{can.delete && (
				<DeleteDialog
					item={item}
					onOpenChange={onOpenChange}
					open={dialog === "delete"}
				/>
			)}
		</>
	);
}
