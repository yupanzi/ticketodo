import { cn } from "~/lib/utils";

/**
 * 页面骨架：每个页面都由 PageHeader + 若干 Panel 组成，标题、间距、卡片样式只在这里定义。
 * ⚠️ 页面里别再手写「标题 + 卡片边框」：要不同的样式就在这里加变体，保持全站一致。
 */

export function PageHeader({
	title,
	description,
	actions,
	eyebrow,
	size = "page",
	children,
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	/** 标题上方的小字（单号、面包屑） */
	eyebrow?: React.ReactNode;
	/** detail：详情页的大标题 */
	size?: "page" | "detail";
	/** 标题下方的附加行（详情页的状态标签） */
	children?: React.ReactNode;
}) {
	return (
		<header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
			<div className="flex min-w-0 flex-col gap-1">
				{eyebrow && (
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						{eyebrow}
					</div>
				)}
				<h1
					className={cn(
						"font-semibold tracking-tight",
						size === "detail" ? "text-title" : "text-2xl",
					)}
				>
					{title}
				</h1>
				{description && (
					<p className="text-muted-foreground text-sm">{description}</p>
				)}
				{children && (
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{children}
					</div>
				)}
			</div>
			{actions && (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			)}
		</header>
	);
}

export function Panel({
	title,
	description,
	actions,
	children,
	className,
	bodyClassName,
	flush = false,
}: {
	title?: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	bodyClassName?: string;
	/** 内容贴边（表格、列表）：不加内边距 */
	flush?: boolean;
}) {
	return (
		<section
			className={cn(
				"overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs",
				className,
			)}
		>
			{(title || actions) && (
				<div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
					<div className="flex min-w-0 flex-col">
						{title && <h2 className="font-semibold text-lg">{title}</h2>}
						{description && (
							<p className="text-muted-foreground text-xs">{description}</p>
						)}
					</div>
					{actions && <div className="flex items-center gap-2">{actions}</div>}
				</div>
			)}
			<div className={cn(!flush && "p-5", bodyClassName)}>{children}</div>
		</section>
	);
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: {
	icon?: React.ReactNode;
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
				className,
			)}
		>
			{icon && (
				<div className="text-muted-foreground/60 [&>svg]:size-8">{icon}</div>
			)}
			<p className="font-medium text-sm">{title}</p>
			{description && (
				<p className="max-w-sm text-muted-foreground text-xs">{description}</p>
			)}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}

/** 表单字段：标签、控件、说明三段式 */
export function Field({
	label,
	htmlFor,
	hint,
	required,
	children,
	className,
}: {
	label: string;
	htmlFor?: string;
	hint?: React.ReactNode;
	required?: boolean;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<label className="font-medium text-sm" htmlFor={htmlFor}>
				{label}
				{required && <span className="ml-0.5 text-red-600">*</span>}
			</label>
			{children}
			{hint && <p className="text-muted-foreground text-xs">{hint}</p>}
		</div>
	);
}

/** 详情侧栏的「属性：值」列表 */
export function PropertyList({ children }: { children: React.ReactNode }) {
	return <dl className="flex flex-col divide-y">{children}</dl>;
}

export function Property({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<dt className="shrink-0 text-muted-foreground text-sm">{label}</dt>
			<dd className="min-w-0 text-right text-sm">{children}</dd>
		</div>
	);
}
