import { requireSession } from "~/server/auth/session";

import { SignOutButton } from "./sign-out-button";

export default async function Home() {
	const { user } = await requireSession();
	return (
		<main className="flex flex-col gap-4 p-8">
			<p>
				{user.name}（{user.role === "admin" ? "管理员" : "成员"}）
			</p>
			<SignOutButton />
		</main>
	);
}
