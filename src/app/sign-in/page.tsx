import { redirect } from "next/navigation";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { getSession } from "~/server/auth/session";

import { SignInButton } from "./sign-in-button";

/** better-auth 回调失败时 `?error=` 的常见值；其余显示通用文案加错误码 */
const ERROR_MESSAGES: Record<string, string> = {
	access_denied: "已取消授权，或你没有使用本应用的权限。",
	state_not_found: "登录已过期，请重新登录。",
	state_mismatch: "登录已过期，请重新登录。",
	please_restart_the_process: "登录已过期，请重新登录。",
	unable_to_create_user: "无法创建账号，请联系管理员。",
	email_doesn_t_match: "账号信息不一致，请联系管理员。",
	// authentik 不可达或 discovery 配错；下次点登录会重试 discovery
	PROVIDER_NOT_FOUND:
		"暂时连不上企业登录服务，请稍后重试；持续出现请联系管理员。",
};

/** 只收站内相对路径：`next` 来自地址栏，放过 `//evil.com` 就是开放重定向 */
function safeNext(raw: string | string[] | undefined): string {
	return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
		? raw
		: "/";
}

export default async function SignInPage({
	searchParams,
}: PageProps<"/sign-in">) {
	const params = await searchParams;
	const next = safeNext(params.next);
	if (await getSession()) redirect(next);

	const error = typeof params.error === "string" ? params.error : undefined;

	return (
		<main className="flex flex-1 items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-xl">ticketodo</CardTitle>
					<CardDescription>
						按重要 × 紧急排优先级的 ticket 与 todo
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{error && (
						<p className="text-destructive text-sm" role="alert">
							{ERROR_MESSAGES[error] ??
								`登录失败（${error}），请重试或联系管理员。`}
						</p>
					)}
					<SignInButton callbackURL={next} />
				</CardContent>
			</Card>
		</main>
	);
}
