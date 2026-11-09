"use client";

import { useQuery } from "@tanstack/react-query";
import {
	Bell,
	CalendarDays,
	ChartGantt,
	ChevronsUpDown,
	KeyRound,
	KeySquare,
	LayoutGrid,
	ListTodo,
	LogOut,
	Menu,
	Plus,
	ScrollText,
	Tags,
	Trash2,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";
import { orpc } from "~/orpc/client";

import { useMe } from "./me-context";
import { UserAvatar } from "./user-avatar";

type NavItem = {
	href: string;
	/** 哪些路径算在这一项下；缺省为 href 及其子路径 */
	match?: (pathname: string) => boolean;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	/** 右侧数字 */
	count?: number;
};

function useNav() {
	const me = useMe();
	// 30s 轮询：站内通知不走推送
	const { data: unread = 0 } = useQuery(
		orpc.notification.unreadCount.queryOptions({
			refetchInterval: 30_000,
			select: (r) => r.count,
		}),
	);
	const work: NavItem[] = [
		{ href: "/", match: (p) => p === "/", label: "象限看板", icon: LayoutGrid },
		{
			href: "/items",
			// 详情页算列表下；新建页有自己的按钮，不高亮任何项
			match: (p) =>
				p === "/items" || (p.startsWith("/items/") && p !== "/items/new"),
			label: "全部单子",
			icon: ListTodo,
		},
		{ href: "/calendar", label: "日历视图", icon: CalendarDays },
		{ href: "/gantt", label: "甘特视图", icon: ChartGantt },
		{ href: "/notifications", label: "站内通知", icon: Bell, count: unread },
		{ href: "/settings/api-keys", label: "接口密钥", icon: KeyRound },
	];
	const admin: NavItem[] =
		me.role === "admin"
			? [
					{ href: "/admin/users", label: "成员管理", icon: Users },
					{ href: "/admin/tags", label: "标签管理", icon: Tags },
					{ href: "/admin/trash", label: "已删单子", icon: Trash2 },
					{ href: "/admin/api-keys", label: "密钥管理", icon: KeySquare },
					{ href: "/admin/audit", label: "审计日志", icon: ScrollText },
				]
			: [];
	return { work, admin };
}

function NavLink({
	item,
	onNavigate,
}: {
	item: NavItem;
	onNavigate?: () => void;
}) {
	const pathname = usePathname();
	const active = item.match
		? item.match(pathname)
		: pathname.startsWith(item.href);
	const Icon = item.icon;
	return (
		<Link
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
				active
					? "bg-foreground font-medium text-background"
					: "text-foreground/75 hover:bg-muted hover:text-foreground",
			)}
			href={item.href}
			onClick={onNavigate}
		>
			<Icon className="size-[18px] shrink-0" />
			<span className="flex-1 truncate">{item.label}</span>
			{item.count ? (
				<span
					className={cn(
						"min-w-5 rounded-full px-1.5 text-center font-semibold text-xs tabular-nums",
						active ? "bg-background text-foreground" : "bg-red-600 text-white",
					)}
				>
					{item.count > 99 ? "99+" : item.count}
				</span>
			) : null}
		</Link>
	);
}

function SidebarBody({
	image,
	onNavigate,
}: {
	image: string | null;
	onNavigate?: () => void;
}) {
	const me = useMe();
	const router = useRouter();
	const { work, admin } = useNav();
	return (
		<div className="flex h-full flex-col gap-6 px-3 py-4">
			<Link
				className="flex items-center gap-2.5 px-2"
				href="/"
				onClick={onNavigate}
			>
				<span className="grid size-8 place-items-center rounded-lg bg-foreground font-bold text-background text-sm">
					T
				</span>
				<span className="font-semibold text-base tracking-tight">
					ticketodo
				</span>
			</Link>

			<Button asChild className="w-full">
				<Link href="/items/new" onClick={onNavigate}>
					<Plus />
					新建
				</Link>
			</Button>

			<nav aria-label="主导航" className="flex flex-col gap-1">
				{work.map((item) => (
					<NavLink item={item} key={item.href} onNavigate={onNavigate} />
				))}
			</nav>

			{admin.length > 0 && (
				<nav aria-label="管理" className="flex flex-col gap-1">
					<p className="px-3 pb-1 font-medium text-muted-foreground text-xs">
						管理
					</p>
					{admin.map((item) => (
						<NavLink item={item} key={item.href} onNavigate={onNavigate} />
					))}
				</nav>
			)}

			<div className="mt-auto">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
							type="button"
						>
							<UserAvatar className="size-8" user={{ name: me.name, image }} />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate font-medium text-sm">{me.name}</span>
								<span className="text-muted-foreground text-xs">
									{me.role === "admin" ? "管理员" : "成员"}
								</span>
							</span>
							<ChevronsUpDown className="size-4 text-muted-foreground" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56" side="top">
						<DropdownMenuItem
							onSelect={async () => {
								await authClient.signOut();
								router.replace("/sign-in");
							}}
						>
							<LogOut />
							退出登录
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

export function AppShell({
	image,
	children,
}: {
	image: string | null;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-full flex-1">
			{/* 宽屏：固定侧栏 */}
			<aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar lg:block">
				<SidebarBody image={image} />
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				{/* 窄屏：顶栏 + 抽屉 */}
				<header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-sidebar px-4 lg:hidden">
					<Sheet>
						<SheetTrigger asChild>
							<Button aria-label="打开导航" size="icon" variant="ghost">
								<Menu />
							</Button>
						</SheetTrigger>
						<SheetContent className="w-64 p-0" side="left">
							<SheetTitle className="sr-only">导航</SheetTitle>
							<SidebarBody image={image} />
						</SheetContent>
					</Sheet>
					<span className="font-semibold">ticketodo</span>
				</header>
				<main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-6 lg:px-10 lg:py-8">
					{children}
				</main>
			</div>
		</div>
	);
}
