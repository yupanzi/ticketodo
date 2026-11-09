import { AppShell } from "~/components/app-shell";
import { MeProvider } from "~/components/me-context";
import { QueryProvider } from "~/orpc/react";
import { requireSession } from "~/server/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
	const { user } = await requireSession();
	const me = {
		id: user.id,
		name: user.name,
		role: user.role === "admin" ? ("admin" as const) : ("member" as const),
	};
	return (
		<QueryProvider>
			<MeProvider me={me}>
				<AppShell image={user.image ?? null}>{children}</AppShell>
			</MeProvider>
		</QueryProvider>
	);
}
