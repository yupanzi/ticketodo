"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "~/components/ui/input";
import { normalizeTagNames, TAG_NAME_MAX_LENGTH } from "~/domain/tag";
import { useTRPC } from "~/trpc/react";

import { Chip } from "./chip";

/** 回车或逗号添加；新名字保存时自动建标签（大小写不敏感地复用已有的） */
export function TagInput({
	value,
	onChange,
	id,
}: {
	value: string[];
	onChange: (tags: string[]) => void;
	id?: string;
}) {
	const trpc = useTRPC();
	const { data: all = [] } = useQuery(trpc.tag.list.queryOptions());
	const [draft, setDraft] = useState("");
	const listId = useId();

	const add = (raw: string) => {
		const next = normalizeTagNames([...value, ...raw.split(/[,，]/)]);
		if (next.length > 10) return;
		onChange(next);
		setDraft("");
	};

	return (
		<div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
			{value.map((t) => (
				<Chip className="rounded-md pr-1.5" key={t} tone="neutral">
					# {t}
					<button
						aria-label={`移除标签 ${t}`}
						onClick={() => onChange(value.filter((x) => x !== t))}
						type="button"
					>
						<X />
					</button>
				</Chip>
			))}
			<Input
				className="h-7 min-w-24 flex-1 border-0 px-1 shadow-none focus-visible:border-0 focus-visible:ring-0"
				id={id}
				list={listId}
				maxLength={TAG_NAME_MAX_LENGTH}
				onBlur={() => draft.trim() && add(draft)}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
						e.preventDefault();
						add(draft);
					} else if (e.key === "Backspace" && !draft && value.length) {
						onChange(value.slice(0, -1));
					}
				}}
				placeholder={value.length ? "" : "回车添加标签"}
				value={draft}
			/>
			<datalist id={listId}>
				{all
					.filter(
						(t) => !value.some((v) => v.toLowerCase() === t.name.toLowerCase()),
					)
					.map((t) => (
						<option key={t.id} value={t.name} />
					))}
			</datalist>
		</div>
	);
}
