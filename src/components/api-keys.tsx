"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	API_KEY_LEVEL_LABEL,
	API_KEY_LEVELS,
	API_KEY_NAME_MAX_LENGTH,
	API_KEY_TTL_PRESETS,
	type ApiKeyLevel,
	isApiKeyExpired,
} from "~/domain/api-key";
import { daysBetween, todayInAppTz } from "~/domain/due";
import { canIssueApiKey } from "~/domain/policy";
import { formatDateTime, formatDay, formatRelative } from "~/lib/format";
import { type ApiOutputs, orpc } from "~/orpc/client";

import { Chip } from "./chip";
import { DatePicker } from "./date-picker";
import { EmptyState, Field, PageHeader, Panel } from "./layout";
import { useMe } from "./me-context";

type ApiKey = ApiOutputs["apiKey"]["list"][number];
type Issued = ApiOutputs["apiKey"]["create"];

export const LEVEL_HINT: Record<ApiKeyLevel, string> = {
	read: "只能查，不能改",
	write: "和你在页面上能做的一样，不含管理员权限",
	admin: "你的全部权限，含管理员操作",
};

export function LevelChip({ level }: { level: ApiKeyLevel }) {
	return (
		<Chip tone={level === "admin" ? "ink" : "outline"}>
			{API_KEY_LEVEL_LABEL[level]}
		</Chip>
	);
}

/** 过期是红、7 天内到期是琥珀，与条目的到期同一套语义色 */
export function ExpiryChip({ expiresAt }: { expiresAt: string | null }) {
	if (expiresAt === null) return <Chip tone="muted">永不过期</Chip>;
	if (isApiKeyExpired(expiresAt)) return <Chip tone="red-soft">已过期</Chip>;
	const day = todayInAppTz(new Date(expiresAt));
	const left = daysBetween(todayInAppTz(), day);
	return (
		<Chip
			title={formatDateTime(expiresAt)}
			tone={left <= 7 ? "amber-soft" : "outline"}
		>
			{left <= 7 ? `${left} 天后到期` : `到 ${formatDay(day)}`}
		</Chip>
	);
}

/** 理由同 item-activity 的 Time：相对时间不报 hydration 警告 */
export function LastUsed({ at }: { at: string | null }) {
	return (
		<span
			className="text-muted-foreground text-xs"
			suppressHydrationWarning
			title={at ? formatDateTime(at) : undefined}
		>
			{at ? formatRelative(at) : "没用过"}
		</span>
	);
}

/** 明文只在这里出现一次：关掉就再也看不到，丢了只能重新签发 */
function IssuedDialog({
	issued,
	onClose,
}: {
	issued: Issued | null;
	onClose: () => void;
}) {
	const origin = typeof window === "undefined" ? "" : window.location.origin;
	const copy = async (text: string) => {
		await navigator.clipboard.writeText(text);
		toast.success("已复制");
	};
	return (
		<Dialog onOpenChange={(o) => !o && onClose()} open={issued !== null}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>复制「{issued?.key.name}」的密钥</DialogTitle>
					<DialogDescription>
						它只显示这一次，库里只存了哈希。丢了就重新签发，旧的会立即失效。
					</DialogDescription>
				</DialogHeader>
				{issued && (
					// min-w-0：弹窗是 grid，长 token 会把列撑得比弹窗还宽
					<div className="flex min-w-0 flex-col gap-4">
						<div className="flex min-w-0 gap-2">
							<Input
								aria-label="API key"
								className="min-w-0 flex-1 font-mono"
								onFocus={(e) => e.currentTarget.select()}
								readOnly
								value={issued.token}
							/>
							<Button onClick={() => copy(issued.token)} variant="outline">
								<Copy />
								复制
							</Button>
						</div>
						<Field label="试一下">
							<pre className="whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs">
								{`curl -H "Authorization: Bearer ${issued.token}" \\\n  ${origin}/api/v1/users/me`}
							</pre>
						</Field>
						<p className="text-muted-foreground text-sm">
							全部接口见{" "}
							<code className="break-all font-mono text-xs">
								{origin}/api/v1/openapi.json
							</code>
							（同样带这个 key 访问）。
						</p>
					</div>
				)}
				<DialogFooter>
					<Button onClick={onClose}>我已保存</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type Ttl = `${(typeof API_KEY_TTL_PRESETS)[number]}` | "custom" | "never";

function IssueDialog({
	open,
	onOpenChange,
	onIssued,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	onIssued: (issued: Issued) => void;
}) {
	const me = useMe();
	const qc = useQueryClient();
	const [name, setName] = useState("");
	const [level, setLevel] = useState<ApiKeyLevel>("write");
	const [ttl, setTtl] = useState<Ttl>("90");
	const [until, setUntil] = useState("");
	const today = todayInAppTz();
	const ttlDays =
		ttl === "never"
			? null
			: ttl === "custom"
				? until
					? daysBetween(today, until)
					: 0
				: Number(ttl);
	const create = useMutation(
		orpc.apiKey.create.mutationOptions({
			onSuccess: (issued) => {
				void qc.invalidateQueries({ queryKey: orpc.apiKey.key() });
				onOpenChange(false);
				onIssued(issued);
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	const valid = name.trim() && (ttlDays === null || ttlDays >= 1);
	return (
		<Dialog
			onOpenChange={(o) => {
				if (o) {
					setName("");
					setLevel("write");
					setTtl("90");
					setUntil("");
				}
				onOpenChange(o);
			}}
			open={open}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>签发 API key</DialogTitle>
					<DialogDescription>
						拿着它的 AI 或脚本以你的身份操作，界面上会标「API」。
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-5"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) create.mutate({ name: name.trim(), level, ttlDays });
					}}
				>
					<Field
						hint="写清给谁用，如「笔记本上的 Claude Code」"
						htmlFor="key-name"
						label="名称"
						required
					>
						<Input
							autoComplete="off"
							id="key-name"
							maxLength={API_KEY_NAME_MAX_LENGTH}
							onChange={(e) => setName(e.target.value)}
							value={name}
						/>
					</Field>
					<Field hint={LEVEL_HINT[level]} htmlFor="key-level" label="权限">
						<Select
							onValueChange={(v) => setLevel(v as ApiKeyLevel)}
							value={level}
						>
							<SelectTrigger className="w-full" id="key-level">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{API_KEY_LEVELS.filter((l) => canIssueApiKey(me, l)).map(
									(l) => (
										<SelectItem key={l} value={l}>
											{API_KEY_LEVEL_LABEL[l]}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</Field>
					<Field
						hint={ttl === "never" ? "不用了记得撤销" : "过期后重新签发即可续上"}
						htmlFor="key-ttl"
						label="有效期"
					>
						<div className="flex gap-2">
							<Select onValueChange={(v) => setTtl(v as Ttl)} value={ttl}>
								<SelectTrigger className="w-36" id="key-ttl">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{API_KEY_TTL_PRESETS.map((d) => (
										<SelectItem key={d} value={String(d)}>
											{d} 天
										</SelectItem>
									))}
									<SelectItem value="custom">自定义日期</SelectItem>
									<SelectItem value="never">永不过期</SelectItem>
								</SelectContent>
							</Select>
							{ttl === "custom" && (
								<DatePicker
									className="flex-1"
									onChange={setUntil}
									placeholder="到哪天"
									value={until}
								/>
							)}
						</div>
					</Field>
					<DialogFooter>
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="ghost"
						>
							取消
						</Button>
						<Button disabled={!valid || create.isPending} type="submit">
							签发
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function KeyActions({
	k,
	onIssued,
}: {
	k: ApiKey;
	onIssued: (issued: Issued) => void;
}) {
	const qc = useQueryClient();
	const refresh = () =>
		void qc.invalidateQueries({ queryKey: orpc.apiKey.key() });
	const rotate = useMutation(
		orpc.apiKey.rotate.mutationOptions({
			onSuccess: (issued) => {
				refresh();
				onIssued(issued);
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	const revoke = useMutation(
		orpc.apiKey.revoke.mutationOptions({
			onSuccess: refresh,
			onError: (err) => toast.error(err.message),
		}),
	);
	return (
		<span className="flex justify-end gap-1">
			<Button
				disabled={rotate.isPending}
				onClick={() => {
					if (confirm(`重新签发「${k.name}」？旧密钥立即失效。`))
						rotate.mutate({ id: k.id });
				}}
				size="sm"
				variant="outline"
			>
				重新签发
			</Button>
			<Button
				disabled={revoke.isPending}
				onClick={() => {
					if (confirm(`撤销「${k.name}」？用它的 AI 或脚本会立即失去访问。`))
						revoke.mutate({ id: k.id });
				}}
				size="sm"
				variant="ghost"
			>
				撤销
			</Button>
		</span>
	);
}

export function ApiKeys() {
	const { data = [], isLoading } = useQuery(orpc.apiKey.list.queryOptions());
	const [issuing, setIssuing] = useState(false);
	const [issued, setIssued] = useState<Issued | null>(null);
	return (
		<>
			<PageHeader
				actions={
					<Button onClick={() => setIssuing(true)}>
						<KeyRound />
						签发 key
					</Button>
				}
				description="给 AI 或脚本用的个人 key：它以你的身份调接口，权限、通知、审计都和你在页面上操作一样。key 管理只能在这里做，key 自己调不了。"
				title="接口密钥"
			/>
			<Panel flush>
				{!isLoading && data.length === 0 ? (
					<EmptyState
						description="签一个给 Claude Code 之类的 AI，让它帮你建单、改状态、写评论。"
						icon={<KeyRound />}
						title="还没有 API key"
					/>
				) : (
					<Table>
						<TableHeader className="bg-muted/40">
							<TableRow>
								<TableHead>名称</TableHead>
								<TableHead className="w-24">权限</TableHead>
								<TableHead className="w-32">密钥</TableHead>
								<TableHead className="w-32">有效期</TableHead>
								<TableHead className="w-28">最近使用</TableHead>
								<TableHead className="w-40">签发于</TableHead>
								<TableHead className="w-48" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((k) => (
								<TableRow key={k.id}>
									<TableCell className="font-medium">{k.name}</TableCell>
									<TableCell>
										<LevelChip level={k.level} />
									</TableCell>
									<TableCell className="font-mono text-muted-foreground text-xs">
										{k.start}…
									</TableCell>
									<TableCell>
										<ExpiryChip expiresAt={k.expiresAt} />
									</TableCell>
									<TableCell>
										<LastUsed at={k.lastUsedAt} />
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{formatDateTime(k.rotatedAt ?? k.createdAt)}
										{k.rotatedAt && "（重签）"}
									</TableCell>
									<TableCell>
										<KeyActions k={k} onIssued={setIssued} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Panel>
			<IssueDialog
				onIssued={setIssued}
				onOpenChange={setIssuing}
				open={issuing}
			/>
			<IssuedDialog issued={issued} onClose={() => setIssued(null)} />
		</>
	);
}
