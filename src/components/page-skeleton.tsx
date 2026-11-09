import { Skeleton } from "~/components/ui/skeleton";

/**
 * 各路由 `loading.tsx` 的骨架：点链接立刻有反馈，Next 也才会预取动态页面（没有 loading 边界的
 * 动态路由不预取）。⚠️ 网格要与真实页面一致，内容到了才不跳。
 */
export function PageSkeleton({
	variant,
}: {
	variant: "board" | "table" | "detail" | "page" | "calendar";
}) {
	return (
		<div aria-busy className="flex flex-col">
			<span className="sr-only">加载中</span>
			<header className="mb-6 flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-2">
					{variant === "detail" && <Skeleton className="h-4 w-40" />}
					<Skeleton className="h-8 w-56" />
					{variant === "detail" && (
						<div className="mt-1 flex gap-2">
							<Skeleton className="h-6 w-16" />
							<Skeleton className="h-6 w-24" />
						</div>
					)}
				</div>
				{(variant === "board" || variant === "calendar") && (
					<Skeleton className="h-9 w-72" />
				)}
			</header>
			{variant === "board" && (
				<>
					<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
						{[0, 1, 2, 3].map((i) => (
							<Skeleton className="h-20 rounded-xl" key={i} />
						))}
					</div>
					<div className="grid gap-4 lg:grid-cols-2">
						{[0, 1, 2, 3].map((i) => (
							<Skeleton className="h-64 rounded-xl" key={i} />
						))}
					</div>
				</>
			)}
			{variant === "table" && (
				<>
					<Skeleton className="mb-4 h-9 w-full max-w-2xl" />
					<div className="flex flex-col gap-px overflow-hidden rounded-xl border">
						{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
							<Skeleton className="h-12 rounded-none" key={i} />
						))}
					</div>
				</>
			)}
			{variant === "detail" && (
				<>
					<div className="mb-6 flex gap-2">
						<Skeleton className="h-9 w-24" />
						<Skeleton className="h-9 w-20" />
					</div>
					<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
						<Skeleton className="h-96 rounded-xl" />
						<Skeleton className="h-64 rounded-xl" />
					</div>
				</>
			)}
			{variant === "calendar" && <Skeleton className="h-[36rem] rounded-xl" />}
			{variant === "page" && <Skeleton className="h-80 rounded-xl" />}
		</div>
	);
}
