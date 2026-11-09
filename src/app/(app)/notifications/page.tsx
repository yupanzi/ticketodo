import type { Metadata } from "next";

import { NotificationList } from "~/components/notification-list";

export const metadata: Metadata = { title: "站内通知" };

export default function NotificationsPage() {
	return <NotificationList />;
}
