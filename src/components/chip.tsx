import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

/**
 * 全站唯一的小标签形态：优先级、状态、到期、类型、标签都基于它，高度、圆角、字号一致，只换色调。
 * 色调有语义：solid 用于「重要」（P0 / P1），soft 用于提示，muted 用于已结束 / 不重要。
 * 主色保持黑白：只有告警（红、琥珀）与「已解决」（绿）带颜色。
 */
export const chipVariants = cva(
	"inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-medium text-xs [&>svg]:size-3.5",
	{
		variants: {
			tone: {
				ink: "bg-foreground text-background",
				red: "bg-red-600 text-white",
				"red-soft": "bg-red-50 text-red-700 ring-1 ring-red-200 ring-inset",
				"amber-soft":
					"bg-amber-50 text-amber-800 ring-1 ring-amber-200 ring-inset",
				"green-soft":
					"bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 ring-inset",
				neutral: "bg-muted text-foreground/80",
				outline: "bg-card text-foreground/80 ring-1 ring-border ring-inset",
				muted: "text-muted-foreground ring-1 ring-border ring-inset",
			},
		},
		defaultVariants: { tone: "neutral" },
	},
);

export function Chip({
	tone,
	className,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
	return <span className={cn(chipVariants({ tone }), className)} {...props} />;
}

/** 状态圆点：放在 Chip 里，与优先级的实心块在形态上区分开 */
export function Dot({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={cn("size-1.5 rounded-full bg-current", className)}
		/>
	);
}
