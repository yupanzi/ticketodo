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
import type { DayRange } from "~/domain/due";
import { formatDateTime } from "~/lib/format";
import { orpc } from "~/orpc/client";

import { ApiBadge } from "./badges";
import { Chip } from "./chip";
import { DateRangePicker } from "./date-picker";
import { PageHeader, Panel } from "./layout";

/** 起止日期按北京时间的整天算 */
function dayBound(day: string | undefined, end: boolean): string | undefined {
	if (!day) return undefined;
	return `${day}T${end ? "23:59:59.999" : "00:00:00"}+08:00`;
}

/** `apiKeyId` 从「密钥管理」点进来：只看这个 key 做过的事（key 泄露时查） */
export function AdminAudit({ apiKeyId }: { apiKeyId?: string }) {
	const [keyFilter, setKeyFilter] = useState(apiKeyId);
	const [action, setAction] = useState("");
	const [target, setTarget] = useState("");
	const [status, setStatus] = useState<"any" | "success" | "failure">("any");
	const [range, setRange] = useState<DayRange>({});
	const deferredAction = useDeferredValue(action);
	const deferredTarget = useDeferredValue(target);
	const [open, setOpen] = useState<number | null>(null);

	const list = useInfiniteQuery(
		orpc.admin.auditLogs.infiniteOptions({
			input: (cursor: number | undefined) => ({
				action: deferredAction.trim() || undefined,
				target: deferredTarget.trim() || undefined,
				status: status === "any" ? undefined : status,
				from: dayBound(range.from, false),
				to: dayBound(range.to, true),
				apiKeyId: keyFilter,
				cursor,
				limit: 50,
			}),
			initialPageParam: undefined,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
	);
	const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

	return (
		<>
			<PageHeader
				description="写操作、登录与权限变更都在这里，只追加、不可修改。点一行看请求详情。"
				title="审计日志"
			/>
			<Panel flush>
				<div className="flex flex-wrap items-center gap-2 border-b px-5 py-4">
					<Input
						aria-label="动作前缀"
						autoComplete="off"
						className="w-44"
						name="action"
						onChange={(e) => setAction(e.target.value)}
						placeholder="动作前缀，如 item. / auth."
						value={action}
					/>
					<Input
						aria-label="对象"
						autoComplete="off"
						className="w-56"
						name="target"
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
					<DateRangePicker
						aria-label="日期范围"
						className="w-64"
						onChange={setRange}
						value={range}
					/>
					{keyFilter && (
						<Chip tone="ink">
							只看一个 API key
							<button
								aria-label="不再只看这个 key"
								className="-mr-1 rounded-full px-1 hover:opacity-70"
								onClick={() => setKeyFilter(undefined)}
								type="button"
							>
								×
							</button>
						</Chip>
					)}
				</div>
				<div>
					<Table>
						<TableHeader className="bg-muted/40">
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
											<span className="flex items-center gap-1.5">
												{r.actorName ??
													(r.actorType === "system" ? "系统" : "—")}
												{r.apiKeyName && <ApiBadge keyName={r.apiKeyName} />}
											</span>
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
															apiKeyId: r.apiKeyId,
															apiKeyName: r.apiKeyName,
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
					<div className="flex justify-center border-t p-4">
						<Button
							disabled={list.isFetchingNextPage}
							onClick={() => list.fetchNextPage()}
							variant="outline"
						>
							加载更多
						</Button>
					</div>
				)}
			</Panel>
		</>
	);
}
