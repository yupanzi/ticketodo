"use client";

import { createContext, useContext } from "react";

import type { Actor } from "~/domain/policy";

export type Me = Actor & { name: string };

const MeContext = createContext<Me | null>(null);

/** 当前登录的人：客户端用它跑 `~/domain/policy` 决定按钮，服务端仍会再判一遍 */
export function MeProvider({
	me,
	children,
}: {
	me: Me;
	children: React.ReactNode;
}) {
	return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe(): Me {
	const me = useContext(MeContext);
	if (!me) throw new Error("useMe 必须在 MeProvider 内使用");
	return me;
}
