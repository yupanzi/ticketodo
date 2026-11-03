import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import { MENTION_SCHEME } from "~/domain/mention";
import { cn } from "~/lib/utils";

/**
 * 描述与评论的渲染：GFM（任务清单、表格、删除线、自动链接）。⚠️ 不开 raw HTML（不加 rehype-raw）：
 * 正文是用户写的。
 * `@[名字](user:<id>)` 渲染成提及；其余链接新窗口打开。
 */
export function Markdown({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	// 把 @ 挪进链接文字里，渲染成一个整体
	const source = children.replace(
		/@\[([^\]\n]{1,64})\]\(user:/g,
		"[@$1](user:",
	);
	return (
		<div
			className={cn(
				"break-words text-sm leading-relaxed",
				"[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
				"[&_h1]:mt-3 [&_h1]:font-semibold [&_h1]:text-base [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:font-semibold",
				"[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[0.85em]",
				"[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
				"[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
				"[&_table]:my-2 [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2",
				"[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1 [&_.task-list-item_input]:mr-1.5 [&_del]:text-muted-foreground",
				className,
			)}
		>
			<ReactMarkdown
				components={{
					a: ({ href, children: text }) =>
						href?.startsWith(MENTION_SCHEME) ? (
							<span className="rounded bg-primary/10 px-1 font-medium text-primary">
								{text}
							</span>
						) : (
							<a
								className="text-primary underline underline-offset-2"
								href={href}
								rel="noopener noreferrer"
								target="_blank"
							>
								{text}
							</a>
						),
				}}
				remarkPlugins={[remarkGfm]}
				urlTransform={(url) =>
					url.startsWith(MENTION_SCHEME) ? url : defaultUrlTransform(url)
				}
			>
				{source}
			</ReactMarkdown>
		</div>
	);
}
