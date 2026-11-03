import { betterAuth } from "better-auth";

import { getDb } from "~/server/db";
import { getServerEnv } from "~/server/env";

import { authOptions } from "./options";

function createAuth() {
	return betterAuth(authOptions(getServerEnv(), getDb()));
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<
	Awaited<ReturnType<Auth["api"]["getSession"]>>
>;

let auth: Auth | undefined;

/** 惰性单例：`next build` 收集页面数据时会 import 路由模块，那时没有 env */
export function getAuth(): Auth {
	auth ??= createAuth();
	return auth;
}
