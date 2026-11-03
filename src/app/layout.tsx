import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";

import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
	title: { default: "ticketodo", template: "%s · ticketodo" },
	description: "ticket 与 todo，按重要 × 紧急四象限排优先级",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
			lang="zh-CN"
		>
			<body className="flex min-h-full flex-col">
				<TooltipProvider>{children}</TooltipProvider>
				<Toaster position="top-center" richColors />
			</body>
		</html>
	);
}
