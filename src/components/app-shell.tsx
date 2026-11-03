"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Plus, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";

import { useMe } from "./me-context";
import { UserAvatar } from "./user-avatar";

const NAV = [
	{ href: "/", label: "四象限" },
	{ href: "/items", label: "全部单子" },
] as const;

const ADMIN_NAV = [
	{ href: "/admin/users", label: "成员与管理员" },
	{ href: "/admin/tags", label: "标签" },
	{ href: "/admin/trash", label: "回收站" },
	{ href: "/admin/audit", label: "审计日志" },
] as const;

function NotificationBell() {
	const trpc = useTRPC();
	// 30s 轮询：站内通知不走推送
	const { data: unread = 0 } = useQuery(
		trpc.notification.unreadCount.queryOptions(undefined, {
			refetchInterval: 30_000,
		}),
	);
	return (
		<Button asChild size="icon" variant="ghost">
			<Link
				aria-label={`通知（${unread} 条未读）`}
				className="relative"
				href="/notifications"
			>
				<Bell />
				{unread > 0 && (
					<span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center font-medium text-[10px] text-white leading-4">
						{unread > 99 ? "99+" : unread}
					</span>
				)}
			</Link>
		</Button>
	);
}

export function AppShell({
	image,
	children,
}: {
	image: string | null;
	children: React.ReactNode;
}) {
	const me = useMe();
	const pathname = usePathname();
	const router = useRouter();
	const isActive = (href: string) =>
		href === "/" ? pathname === "/" : pathname.startsWith(href);

	return (
		<div className="flex min-h-full flex-1 flex-col">
			<header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
				<div className="mx-auto flex h-12 max-w-7xl items-center gap-4 px-4">
					<Link className="font-semibold" href="/">
						ticketodo
					</Link>
					<nav className="flex items-center gap-1">
						{NAV.map((n) => (
							<Link
								className={cn(
									"rounded-md px-2.5 py-1 text-sm",
									isActive(n.href)
										? "bg-muted font-medium"
										: "text-muted-foreground hover:text-foreground",
								)}
								href={n.href}
								key={n.href}
							>
								{n.label}
							</Link>
						))}
					</nav>
					<div className="ml-auto flex items-center gap-1">
						<Button asChild size="sm">
							<Link href="/items/new">
								<Plus />
								新建
							</Link>
						</Button>
						<NotificationBell />
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button aria-label="账号菜单" size="icon" variant="ghost">
									<UserAvatar user={{ name: me.name, image }} />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuLabel>
									{me.name}
									<span className="block font-normal text-muted-foreground text-xs">
										{me.role === "admin" ? "管理员" : "成员"}
									</span>
								</DropdownMenuLabel>
								{me.role === "admin" && (
									<>
										<DropdownMenuSeparator />
										{ADMIN_NAV.map((n) => (
											<DropdownMenuItem asChild key={n.href}>
												<Link href={n.href}>
													<Shield />
													{n.label}
												</Link>
											</DropdownMenuItem>
										))}
									</>
								)}
								<DropdownMenuSeparator />
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
			</header>
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
				{children}
			</main>
		</div>
	);
}
