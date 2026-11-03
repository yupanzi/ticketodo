"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
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
import { Chip } from "./chip";
import { PageHeader, Panel } from "./layout";
import { useMe } from "./me-context";
import { UserChip } from "./user-avatar";

export function AdminUsers() {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const me = useMe();
	const { data = [] } = useQuery(trpc.admin.users.queryOptions());
	const setRole = useMutation(
		trpc.admin.setRole.mutationOptions({
			onSuccess: () =>
				qc.invalidateQueries({ queryKey: trpc.admin.users.queryKey() }),
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<>
			<PageHeader
				description="登录过 ticketodo 的人。授予与撤销都进审计；至少保留一名管理员。"
				title="成员与管理员"
			/>
			<Panel flush>
				<Table>
					<TableHeader className="bg-muted/40">
						<TableRow>
							<TableHead>姓名</TableHead>
							<TableHead>邮箱</TableHead>
							<TableHead className="w-24">角色</TableHead>
							<TableHead className="w-40">首次登录</TableHead>
							<TableHead className="w-32" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.map((u) => (
							<TableRow key={u.id}>
								<TableCell>
									<UserChip user={u} />
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{u.email ?? "—"}
								</TableCell>
								<TableCell>
									<Chip tone={u.role === "admin" ? "ink" : "outline"}>
										{u.role === "admin" ? "管理员" : "成员"}
									</Chip>
								</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{formatDateTime(u.createdAt)}
								</TableCell>
								<TableCell className="text-right">
									<Button
										disabled={setRole.isPending}
										onClick={() => {
											const role = u.role === "admin" ? "member" : "admin";
											const verb =
												role === "admin" ? "设为管理员" : "撤销管理员";
											const self = u.id === me.id ? "（你自己）" : "";
											if (confirm(`${verb}：${u.name}${self}？`))
												setRole.mutate({ userId: u.id, role });
										}}
										size="sm"
										variant="outline"
									>
										{u.role === "admin" ? "撤销管理员" : "设为管理员"}
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Panel>
		</>
	);
}
