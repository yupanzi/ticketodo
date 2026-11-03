import type { Metadata } from "next";

import { ItemsTable } from "~/components/items-table";
import { parseListFilters } from "~/lib/item-filters";

export const metadata: Metadata = { title: "全部单子" };

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
	return <ItemsTable initial={parseListFilters(await searchParams)} />;
}
