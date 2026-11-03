"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useTRPC } from "~/trpc/react";

import { TypeBadge } from "./badges";
import { UserChip } from "./user-avatar";

export function AdminTrash() {
	const trpc = useTRPC();
	const qc = useQueryClient();
	const { data = [], isLoading } = useQuery(trpc.item.trash.queryOptions());
	const restore = useMutation(
		trpc.item.restore.mutationOptions({
			onSuccess: () => qc.invalidateQueries({ queryKey: trpc.item.pathKey() }),
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-40">单号</TableHead>
						<TableHead>标题</TableHead>
						<TableHead className="w-32">提单人</TableHead>
						<TableHead className="w-40">删除于</TableHead>
						<TableHead className="w-24" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((i) => (
						<TableRow key={i.id}>
							<TableCell className="font-mono text-xs">
								<Link className="hover:underline" href={`/items/${i.code}`}>
									{i.code}
								</Link>
							</TableCell>
							<TableCell>
								<span className="flex items-center gap-1.5">
									<TypeBadge type={i.type} />
									{i.title}
								</span>
							</TableCell>
							<TableCell>
								<UserChip user={i.reporter} />
							</TableCell>
							<TableCell className="text-muted-foreground text-xs">
								{i.deletedAt && formatDateTime(i.deletedAt)}
							</TableCell>
							<TableCell className="text-right">
								<Button
									disabled={restore.isPending}
									onClick={() => restore.mutate({ code: i.code })}
									size="sm"
									variant="outline"
								>
									恢复
								</Button>
							</TableCell>
						</TableRow>
					))}
					{!isLoading && data.length === 0 && (
						<TableRow>
							<TableCell
								className="py-8 text-center text-muted-foreground"
								colSpan={5}
							>
								回收站是空的
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
