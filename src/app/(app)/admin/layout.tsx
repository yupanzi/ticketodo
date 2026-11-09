import { notFound } from "next/navigation";

import { requireSession } from "~/server/auth/session";

/** 非管理员一律 404（不暴露后台存在）；接口层另有 `guard({ admin })` 把关。入口在侧栏「管理」分组 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
	const { user } = await requireSession();
	if (user.role !== "admin") notFound();
	return children;
}
