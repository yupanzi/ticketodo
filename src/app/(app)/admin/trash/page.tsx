import type { Metadata } from "next";

import { AdminTrash } from "~/components/admin-trash";

export const metadata: Metadata = { title: "已删单子" };

export default function Page() {
	return <AdminTrash />;
}
