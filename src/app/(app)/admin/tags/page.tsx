import type { Metadata } from "next";

import { AdminTags } from "~/components/admin-tags";

export const metadata: Metadata = { title: "标签管理" };

export default function Page() {
	return <AdminTags />;
}
