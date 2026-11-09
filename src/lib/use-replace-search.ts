"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 把筛选、翻页的状态写回地址栏（replace：不刷历史记录），链接可以直接发给同事。
 * ⚠️ 用原生 replaceState：router.replace 会让服务端把整页连同预取再渲染一遍，每改一次白查一次库。
 */
export function useReplaceSearch(search: string) {
	const pathname = usePathname();
	useEffect(() => {
		window.history.replaceState(null, "", `${pathname}${search}`);
	}, [pathname, search]);
}
