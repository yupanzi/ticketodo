"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

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
import { TAG_COLORS, TAG_NAME_MAX_LENGTH, type TagColor } from "~/domain/tag";
import { type ApiOutputs, orpc } from "~/orpc/client";

import { TagBadge } from "./badges";
import { PageHeader, Panel } from "./layout";

type Tag = ApiOutputs["tag"]["list"][number];

function TagRow({ tag, all }: { tag: Tag; all: Tag[] }) {
	const qc = useQueryClient();
	const [name, setName] = useState(tag.name);
	const done = {
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: orpc.tag.list.queryKey() }),
		onError: (err: { message: string }) => toast.error(err.message),
	};
	const update = useMutation(orpc.tag.update.mutationOptions(done));
	const merge = useMutation(orpc.tag.merge.mutationOptions(done));
	const remove = useMutation(orpc.tag.delete.mutationOptions(done));
	return (
		<TableRow>
			<TableCell>
				<TagBadge color={tag.color} name={tag.name} />
			</TableCell>
			<TableCell>
				<form
					className="flex gap-1.5"
					onSubmit={(e) => {
						e.preventDefault();
						if (name.trim() && name !== tag.name)
							update.mutate({ id: tag.id, name: name.trim() });
					}}
				>
					<Input
						aria-label={`${tag.name} 的新名字`}
						autoComplete="off"
						className="h-8 w-40"
						maxLength={TAG_NAME_MAX_LENGTH}
						name="name"
						onChange={(e) => setName(e.target.value)}
						value={name}
					/>
					<Button
						disabled={name === tag.name || !name.trim()}
						size="sm"
						type="submit"
						variant="outline"
					>
						改名
					</Button>
				</form>
			</TableCell>
			<TableCell>
				<Select
					onValueChange={(color) =>
						update.mutate({ id: tag.id, color: color as TagColor })
					}
					value={tag.color}
				>
					<SelectTrigger aria-label="颜色" className="h-8 w-28">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TAG_COLORS.map((c) => (
							<SelectItem key={c} value={c}>
								<TagBadge color={c} name={c} />
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell>
				<Select
					onValueChange={(target) => {
						const to = all.find((t) => String(t.id) === target);
						if (to && confirm(`把「${tag.name}」并入「${to.name}」？`))
							merge.mutate({ id: tag.id, targetId: to.id });
					}}
					value=""
				>
					<SelectTrigger aria-label="并入" className="h-8 w-32">
						<SelectValue placeholder="并入…" />
					</SelectTrigger>
					<SelectContent>
						{all
							.filter((t) => t.id !== tag.id)
							.map((t) => (
								<SelectItem key={t.id} value={String(t.id)}>
									{t.name}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell className="text-right">
				<Button
					onClick={() => {
						if (
							confirm(`删除标签「${tag.name}」？已打上它的单子会去掉这个标签。`)
						)
							remove.mutate({ id: tag.id });
					}}
					size="sm"
					variant="ghost"
				>
					删除
				</Button>
			</TableCell>
		</TableRow>
	);
}

export function AdminTags() {
	const { data = [] } = useQuery(orpc.tag.list.queryOptions());
	return (
		<>
			<PageHeader
				description="谁都能在建单时新建标签；改名、合并、删除只有管理员。"
				title="标签管理"
			/>
			<Panel flush>
				<Table>
					<TableHeader className="bg-muted/40">
						<TableRow>
							<TableHead className="w-32">标签</TableHead>
							<TableHead>改名</TableHead>
							<TableHead className="w-32">颜色</TableHead>
							<TableHead className="w-36">合并</TableHead>
							<TableHead className="w-20" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.map((t) => (
							<TagRow all={data} key={`${t.id}-${t.name}`} tag={t} />
						))}
					</TableBody>
				</Table>
			</Panel>
		</>
	);
}
