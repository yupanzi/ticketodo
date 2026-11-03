import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { cn } from "~/lib/utils";

/** 头像来自 authentik；没有就显示姓名的最后一个字（中文名通常是名） */
export function UserAvatar({
	user,
	className,
}: {
	user: { name: string; image: string | null };
	className?: string;
}) {
	return (
		// 读屏不读头像：旁边总有名字，读出来就成了「李 Bob 李」
		<Avatar aria-hidden className={cn("size-6", className)}>
			{user.image && <AvatarImage alt={user.name} src={user.image} />}
			<AvatarFallback className="text-xs">
				{Array.from(user.name).at(-1) ?? "?"}
			</AvatarFallback>
		</Avatar>
	);
}

export function UserChip({
	user,
}: {
	user: { name: string; image: string | null };
}) {
	return (
		// align-middle：inline-flex 的基线取第一个子元素，头像是 <img> 时会比纯文字的行高出一截
		<span className="inline-flex items-center gap-1.5 align-middle">
			<UserAvatar user={user} />
			<span className="truncate">{user.name}</span>
		</span>
	);
}
