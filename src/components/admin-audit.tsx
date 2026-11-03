"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Fragment, useDeferredValue, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { formatDateTime } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** 起止日期按北京时间的整天算 */
function dayBound(day: string, end: boolean): Date | undefined {
	if (!day) return undefined;
	return new Date(`${day}T${end ? "23:59:59.999" : "00:00:00"}+08:00`);
}

export function AdminAudit() {
	const trpc = useTRPC();
	const [action, setAction] = useState("");
	const [target, setTarget] = useState("");
	const [status, setStatus] = useState<"any" | "success" | "failure">("any");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const deferredAction = useDeferredValue(action);
	const deferredTarget = useDeferredValue(target);
	const [open, setOpen] = useState<number | null>(null);

	const list = useInfiniteQuery(
		trpc.admin.audit.infiniteQueryOptions(
			{
				action: deferredAction.trim() || undefined,
				target: deferredTarget.trim() || undefined,
				status: status === "any" ? undefined : status,
				from: dayBound(from, false),
				to: dayBound(to, true),
				limit: 50,
			},
			{ getNextPageParam: (last) => last.nextCursor ?? undefined },
		),
	);
	const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					aria-label="动作前缀"
					className="w-44"
					onChange={(e) => setAction(e.target.value)}
					placeholder="动作前缀，如 item. / auth."
					value={action}
				/>
				<Input
					aria-label="对象"
					className="w-56"
					onChange={(e) => setTarget(e.target.value)}
					placeholder="单号，或 user:<id>"
					value={target}
				/>
				<Select
					onValueChange={(v) => setStatus(v as typeof status)}
					value={status}
				>
					<SelectTrigger aria-label="结果" className="w-28">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">全部结果</SelectItem>
						<SelectItem value="success">成功</SelectItem>
						<SelectItem value="failure">失败</SelectItem>
					</SelectContent>
				</Select>
				<Input
					aria-label="起始日期"
					className="w-40"
					onChange={(e) => setFrom(e.target.value)}
					type="date"
					value={from}
				/>
				<span className="text-muted-foreground text-sm">至</span>
				<Input
					aria-label="截止日期"
					className="w-40"
					onChange={(e) => setTo(e.target.value)}
					type="date"
					value={to}
				/>
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-40">时间</TableHead>
							<TableHead className="w-28">操作者</TableHead>
							<TableHead className="w-36">动作</TableHead>
							<TableHead>对象</TableHead>
							<TableHead className="w-16">结果</TableHead>
							<TableHead className="w-32">IP</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<Fragment key={r.id}>
								<TableRow
									className="cursor-pointer"
									onClick={() => setOpen(open === r.id ? null : r.id)}
								>
									<TableCell className="text-xs">
										{formatDateTime(r.at)}
									</TableCell>
									<TableCell className="text-sm">
										{r.actorName ?? (r.actorType === "system" ? "系统" : "—")}
									</TableCell>
									<TableCell className="font-mono text-xs">
										{r.action}
									</TableCell>
									<TableCell className="text-sm">
										<span className="text-muted-foreground">
											{r.targetType}
										</span>{" "}
										{r.targetName ?? r.targetId}
										{r.details?.summary && (
											<span className="text-muted-foreground">
												{" "}
												· {r.details.summary}
											</span>
										)}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												r.status === "success" ? "secondary" : "destructive"
											}
										>
											{r.status === "success" ? "成功" : "失败"}
										</Badge>
									</TableCell>
									<TableCell className="font-mono text-xs">
										{r.ip ?? "—"}
									</TableCell>
								</TableRow>
								{open === r.id && (
									<TableRow>
										<TableCell colSpan={6}>
											<pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
												{JSON.stringify(
													{
														requestId: r.requestId,
														method: r.method,
														path: r.path,
														userAgent: r.userAgent,
														actorId: r.actorId,
														targetId: r.targetId,
														details: r.details,
													},
													null,
													2,
												)}
											</pre>
										</TableCell>
									</TableRow>
								)}
							</Fragment>
						))}
					</TableBody>
				</Table>
			</div>
			{list.hasNextPage && (
				<Button
					className="self-center"
					disabled={list.isFetchingNextPage}
					onClick={() => list.fetchNextPage()}
					variant="outline"
				>
					加载更多
				</Button>
			)}
		</div>
	);
}
