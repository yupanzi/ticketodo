import type { Metadata } from "next";

import { ItemsTable } from "~/components/items-table";

export const metadata: Metadata = { title: "全部单子" };

export default function ItemsPage() {
	return <ItemsTable />;
}
