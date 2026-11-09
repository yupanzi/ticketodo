import type { Metadata } from "next";

import { PageHeader } from "~/components/layout";
import { NewItemForm } from "~/components/new-item-form";
import { ITEM_TYPES, type ItemType } from "~/domain/item";
import { PRIORITIES, type Priority } from "~/domain/priority";

export const metadata: Metadata = { title: "新建" };

/** `?priority=P1&type=todo` 预填（看板象限上的「+」带过来）；优先级只对 todo 有意义 */
export default async function NewItemPage({
	searchParams,
}: PageProps<"/items/new">) {
	const params = await searchParams;
	const priority = PRIORITIES.find((p) => p === params.priority) ?? "P1";
	const type: ItemType = ITEM_TYPES.find((t) => t === params.type) ?? "ticket";
	return (
		<>
			<PageHeader
				description="交给别人的用 Ticket，自己的事用 Todo"
				title="新建"
			/>
			<NewItemForm initialPriority={priority as Priority} initialType={type} />
		</>
	);
}
