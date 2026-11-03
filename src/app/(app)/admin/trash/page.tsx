import type { Metadata } from "next";

import { AdminTrash } from "~/components/admin-trash";

export const metadata: Metadata = { title: "回收站" };

export default function Page() {
	return <AdminTrash />;
}
