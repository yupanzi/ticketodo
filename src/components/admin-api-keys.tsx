"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import Link from "next/link";
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
import { orpc } from "~/orpc/client";

import { ExpiryChip, LastUsed, LevelChip } from "./api-keys";
import { EmptyState, PageHeader, Panel } from "./layout";
import { UserChip } from "./user-avatar";

/** 没有「停用用户」：有人离职或 key 泄露时，在这里撤销是唯一的止损手段 */
export function AdminApiKeys() {
	const qc = useQueryClient();
	const { data = [], isLoading } = useQuery(orpc.admin.apiKeys.queryOptions());
	const revoke = useMutation(
		orpc.admin.revokeApiKey.mutationOptions({
			onSuccess: () =>
				qc.invalidateQueries({ queryKey: orpc.admin.apiKeys.key() }),
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<>
			<PageHeader
				description="全员签发的、还没撤销的 API key。有人离职或 key 泄露时在这里撤销；点「审计」看这个 key 做过什么。"
				title="密钥管理"
			/>
			<Panel flush>
				{!isLoading && data.length === 0 ? (
					<EmptyState icon={<KeyRound />} title="还没有人签发 API key" />
				) : (
					<Table>
						<TableHeader className="bg-muted/40">
							<TableRow>
								<TableHead className="w-40">签发人</TableHead>
								<TableHead>名称</TableHead>
								<TableHead className="w-24">权限</TableHead>
								<TableHead className="w-32">有效期</TableHead>
								<TableHead className="w-28">最近使用</TableHead>
								<TableHead className="w-40">签发于</TableHead>
								<TableHead className="w-36" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((k) => (
								<TableRow key={k.id}>
									<TableCell>
										<UserChip user={k.owner} />
									</TableCell>
									<TableCell>
										<span className="font-medium">{k.name}</span>{" "}
										<span className="font-mono text-muted-foreground text-xs">
											{k.start}…
										</span>
									</TableCell>
									<TableCell>
										<LevelChip level={k.level} />
									</TableCell>
									<TableCell>
										<ExpiryChip expiresAt={k.expiresAt} />
									</TableCell>
									<TableCell>
										<LastUsed at={k.lastUsedAt} />
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{formatDateTime(k.rotatedAt ?? k.createdAt)}
									</TableCell>
									<TableCell>
										<span className="flex justify-end gap-1">
											<Button asChild size="sm" variant="ghost">
												<Link
													href={`/admin/audit?apiKeyId=${encodeURIComponent(k.id)}`}
												>
													审计
												</Link>
											</Button>
											<Button
												disabled={revoke.isPending}
												onClick={() => {
													if (
														confirm(
															`撤销 ${k.owner.name} 的「${k.name}」？用它的 AI 或脚本会立即失去访问。`,
														)
													)
														revoke.mutate({ id: k.id });
												}}
												size="sm"
												variant="outline"
											>
												撤销
											</Button>
										</span>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Panel>
		</>
	);
}
