import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { Auth } from "~/server/auth";

export const authClient = createAuthClient({
	// 让客户端会话里的 user.role 有类型
	plugins: [inferAdditionalFields<Auth>()],
});
