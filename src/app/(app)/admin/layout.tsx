import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "~/server/auth/session";

const TABS = [
	{ href: "/admin/users", label: "成员与管理员" },
	{ href: "/admin/tags", label: "标签" },
	{ href: "/admin/trash", label: "回收站" },
	{ href: "/admin/audit", label: "审计日志" },
] as const;

/** 非管理员一律 404（不暴露后台存在）；接口层另有 adminProcedure 把关 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
	const { user } = await requireSession();
	if (user.role !== "admin") notFound();
	return (
		<div className="flex flex-col gap-6">
			<nav className="flex gap-1 border-b">
				{TABS.map((t) => (
					<Link
						className="-mb-px border-transparent border-b-2 px-3 py-2 text-muted-foreground text-sm hover:text-foreground"
						href={t.href}
						key={t.href}
					>
						{t.label}
					</Link>
				))}
			</nav>
			{children}
		</div>
	);
}
