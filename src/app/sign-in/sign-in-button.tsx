"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth-client";

export function SignInButton({ callbackURL }: { callbackURL: string }) {
	const [pending, setPending] = useState(false);
	return (
		<Button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				// 成功时整页跳去 authentik；失败（如 discovery 不可用）才会走到下一行
				const { error } = await authClient.signIn.social({
					provider: "authentik",
					callbackURL,
					errorCallbackURL: "/sign-in",
				});
				if (error) {
					setPending(false);
					window.location.assign(
						`/sign-in?error=${encodeURIComponent(error.code ?? "unknown")}`,
					);
				}
			}}
			size="lg"
		>
			{pending ? "正在跳转…" : "使用企业账号登录"}
		</Button>
	);
}
