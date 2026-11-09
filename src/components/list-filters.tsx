"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CirclePlus } from "lucide-react";
import {
	type ComponentProps,
	type ReactNode,
	type RefObject,
	useRef,
	useState,
} from "react";

import { Button } from "~/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "~/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { Separator } from "~/components/ui/separator";
import {
	DUE_PRESET_LABEL,
	DUE_PRESETS,
	type DueFilter,
} from "~/domain/item-list";
import { formatDayRange } from "~/lib/format";
import { cn } from "~/lib/utils";
import { orpc } from "~/orpc/client";

import { Chip } from "./chip";
import { DayRangeCalendar } from "./date-picker";
import { useMe } from "./me-context";
import { UserAvatar } from "./user-avatar";
import { useUserSearch } from "./user-picker";

/** 分面筛选的按钮：没选时是虚线框 + 维度名，选了以后跟着已选项（超过两项只给数量） */
function FacetTrigger({
	title,
	picked,
	className,
	...props
}: { title: string; picked: string[] } & ComponentProps<typeof Button>) {
	const active = picked.length > 0;
	return (
		<Button
			className={cn(
				"font-normal",
				!active && "border-dashed text-muted-foreground",
				className,
			)}
			variant="outline"
			{...props}
		>
			<CirclePlus />
			{title}
			{active && (
				<>
					<Separator className="mx-0.5 h-4!" orientation="vertical" />
					{picked.length > 2 ? (
						<Chip>{picked.length} 项</Chip>
					) : (
						picked.map((p) => (
							<Chip key={p}>
								<span className="max-w-28 truncate">{p}</span>
							</Chip>
						))
					)}
				</>
			)}
		</Button>
	);
}

/**
 * Radix 打开弹层时把焦点给第一个可聚焦元素；没有搜索框时那是空的或日历的翻月按钮，而 cmdk 的方向键
 * 挂在它的根节点上，于是键盘选不了项。改为聚焦 cmdk 根节点。
 */
function focusCommand(ref: RefObject<HTMLDivElement | null>) {
	return (e: Event) => {
		e.preventDefault();
		ref.current?.focus();
	};
}

interface FacetOption<V> {
	value: V;
	label: string;
	icon?: ReactNode;
	hint?: string;
}

interface ServerSearch {
	value: string;
	onChange: (q: string) => void;
	placeholder: string;
	empty: string;
}

/** 多选筛选：选项多于 7 个或走服务端搜索时带搜索框 */
export function FacetedFilter<V extends string | number>({
	title,
	options,
	selected,
	onChange,
	search,
	onOpenChange,
}: {
	title: string;
	options: FacetOption<V>[];
	selected: V[];
	onChange: (v: V[]) => void;
	/** 人员这类选项太多的：交给服务端搜，本地不过滤 */
	search?: ServerSearch;
	onOpenChange?: (open: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const commandRef = useRef<HTMLDivElement>(null);
	const hasInput = Boolean(search) || options.length > 7;
	// 服务端搜索的结果异步才到，cmdk 不会再去高亮第一项，输完直接回车就选不中：高亮项受控，
	// 当前高亮的不在结果里就落到第一项
	const [active, setActive] = useState("");
	const highlighted = options.some((o) => String(o.value) === active)
		? active
		: String(options[0]?.value ?? "");
	// 已选但不在选项里（人员名字还在加载、标签已被删）先占个位，免得按钮看起来没在筛
	const picked = selected.map(
		(v) => options.find((o) => o.value === v)?.label ?? "…",
	);
	const toggle = (v: V) =>
		onChange(
			selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v],
		);
	return (
		<Popover
			onOpenChange={(o) => {
				setOpen(o);
				onOpenChange?.(o);
			}}
			open={open}
		>
			<PopoverTrigger asChild>
				<FacetTrigger picked={picked} title={title} />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-64 gap-0 p-0"
				onOpenAutoFocus={hasInput ? undefined : focusCommand(commandRef)}
			>
				<Command
					ref={commandRef}
					shouldFilter={!search}
					{...(search && { value: highlighted, onValueChange: setActive })}
				>
					{search ? (
						<CommandInput
							onValueChange={search.onChange}
							placeholder={search.placeholder}
							value={search.value}
						/>
					) : (
						hasInput && <CommandInput placeholder={`筛选${title}`} />
					)}
					<CommandList label={title}>
						<CommandEmpty>{search?.empty ?? "没有匹配项"}</CommandEmpty>
						<CommandGroup>
							{options.map((o) => (
								<CommandItem
									// cmdk 的 aria-selected 表示键盘高亮，勾选状态另用 aria-checked 告诉读屏
									aria-checked={selected.includes(o.value)}
									data-checked={selected.includes(o.value)}
									key={o.value}
									keywords={[o.label]}
									onSelect={() => toggle(o.value)}
									value={String(o.value)}
								>
									{o.icon}
									<span className="truncate">{o.label}</span>
									{o.hint && (
										<span className="text-muted-foreground text-xs">
											{o.hint}
										</span>
									)}
								</CommandItem>
							))}
						</CommandGroup>
						{selected.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup>
									<CommandItem onSelect={() => onChange([])}>
										清除筛选
									</CommandItem>
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

/** 负责人 / 提单人：任意登录过的人；已选的排最前（搜不到也能取消），没搜时自己排第一 */
export function PeopleFacet({
	title,
	selected,
	onChange,
}: {
	title: string;
	selected: string[];
	onChange: (ids: string[]) => void;
}) {
	const me = useMe();
	const [open, setOpen] = useState(false);
	const { q, setQ, users: found, isFetching } = useUserSearch(open);
	const { data: picked = [] } = useQuery(
		orpc.user.list.queryOptions({
			input: { ids: selected },
			enabled: selected.length > 0,
			placeholderData: keepPreviousData,
		}),
	);
	const rest = found
		.filter((u) => !selected.includes(u.id))
		.sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id));
	const users = [...picked.filter((u) => selected.includes(u.id)), ...rest];
	return (
		<FacetedFilter
			onChange={onChange}
			onOpenChange={setOpen}
			options={users.map((u) => ({
				value: u.id,
				label: u.id === me.id ? `${u.name}（我）` : u.name,
				icon: <UserAvatar className="size-5" user={u} />,
			}))}
			search={{
				value: q,
				onChange: setQ,
				placeholder: "搜索姓名或邮箱",
				empty: isFetching ? "搜索中…" : "没有找到",
			}}
			selected={selected}
			title={title}
		/>
	);
}

/** 期望完成：快捷项（单选）或自定义范围，二者择一 */
export function DueFacet({
	value,
	onChange,
}: {
	value: DueFilter | null;
	onChange: (v: DueFilter | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const commandRef = useRef<HTMLDivElement>(null);
	const choose = (v: DueFilter | null) => {
		onChange(v);
		setOpen(false);
	};
	const range = value && typeof value === "object" ? value : {};
	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<FacetTrigger
					picked={
						value === null
							? []
							: [
									typeof value === "string"
										? DUE_PRESET_LABEL[value]
										: formatDayRange(value),
								]
					}
					title="期望完成"
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-auto gap-0 p-0"
				onOpenAutoFocus={focusCommand(commandRef)}
			>
				<Command ref={commandRef}>
					<CommandList label="期望完成">
						<CommandGroup heading="快捷">
							{DUE_PRESETS.map((p) => (
								<CommandItem
									aria-checked={value === p}
									data-checked={value === p}
									key={p}
									onSelect={() => choose(value === p ? null : p)}
									value={p}
								>
									{DUE_PRESET_LABEL[p]}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
				<div className="border-t">
					<p className="px-3 pt-3 text-muted-foreground text-xs">自定义范围</p>
					<DayRangeCalendar
						numberOfMonths={1}
						onChange={(r) => onChange(r.from || r.to ? r : null)}
						value={range}
					/>
				</div>
				{value && (
					<div className="border-t p-1">
						<Button
							className="w-full"
							onClick={() => choose(null)}
							size="sm"
							variant="ghost"
						>
							清除筛选
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
