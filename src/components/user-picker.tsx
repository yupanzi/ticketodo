"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Button } from "~/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "~/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { useTRPC } from "~/trpc/react";

import { UserChip } from "./user-avatar";

export interface PickedUser {
	id: string;
	name: string;
	image: string | null;
}

/** 只能选登录过的人：搜的是 user 表 */
export function UserPicker({
	value,
	onChange,
	placeholder = "选择负责人",
	disabled,
	id,
}: {
	value: PickedUser | null;
	onChange: (u: PickedUser) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
}) {
	const trpc = useTRPC();
	const [open, setOpen] = useState(false);
	const [q, setQ] = useState("");
	const deferred = useDeferredValue(q);
	const { data = [], isFetching } = useQuery(
		trpc.user.search.queryOptions(
			{ q: deferred },
			{ enabled: open, placeholderData: keepPreviousData },
		),
	);
	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className="w-full justify-between font-normal"
					disabled={disabled}
					id={id}
					role="combobox"
					variant="outline"
				>
					{value ? (
						<UserChip user={value} />
					) : (
						<span className="text-muted-foreground">{placeholder}</span>
					)}
					<ChevronsUpDown className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-(--radix-popover-trigger-width) p-0"
			>
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={setQ}
						placeholder="搜索姓名或邮箱"
						value={q}
					/>
					<CommandList>
						<CommandEmpty>
							{isFetching ? "搜索中…" : "没有找到（只能选登录过的人）"}
						</CommandEmpty>
						<CommandGroup>
							{data.map((u) => (
								<CommandItem
									key={u.id}
									onSelect={() => {
										onChange(u);
										setOpen(false);
									}}
									value={u.id}
								>
									<UserChip user={u} />
									{u.email && (
										<span className="ml-auto truncate text-muted-foreground text-xs">
											{u.email}
										</span>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
