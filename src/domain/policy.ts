import type { ItemStatus, ItemType } from "./item";
import { type ItemRole, nextStatuses } from "./status";

/**
 * 权限矩阵：服务端判权的唯一来源，UI 也只读它决定按钮。看不见与不让做要分开——看不见的服务端一律
 * 回 NOT_FOUND（不泄露别人的 todo 存在），看得见但不让做才回 FORBIDDEN。
 */

export interface Actor {
	id: string;
	role: "member" | "admin";
}

export interface ItemRef {
	type: ItemType;
	status: ItemStatus;
	reporterId: string;
	assigneeId: string;
	deletedAt: Date | null;
}

export function isAdmin(actor: Actor): boolean {
	return actor.role === "admin";
}

/** todo 的所有者是 reporter（也是 assignee） */
export function rolesOf(actor: Actor, item: ItemRef): Set<ItemRole> {
	const roles = new Set<ItemRole>();
	if (item.reporterId === actor.id) roles.add("reporter");
	if (item.assigneeId === actor.id) roles.add("assignee");
	return roles;
}

/** ticket 全员可见；todo 只有本人；已删除的只有管理员（回收站） */
export function canView(actor: Actor, item: ItemRef): boolean {
	if (isAdmin(actor)) return true;
	if (item.deletedAt) return false;
	return item.type === "ticket" || item.reporterId === actor.id;
}

/** 改标题、描述、期望完成日期、标签；优先级另由 `canSetPriority` 管 */
export function canEdit(actor: Actor, item: ItemRef): boolean {
	if (item.deletedAt) return false;
	return isAdmin(actor) || rolesOf(actor, item).size > 0;
}

/**
 * 定级 / 改优先级：接收方定，只有负责人（todo 即本人）与管理员。提单人能改别的字段，改不了优先级：
 * 急不急由做的人判断，提单人的期望写在期望完成日期与描述里。
 */
export function canSetPriority(actor: Actor, item: ItemRef): boolean {
	if (item.deletedAt) return false;
	return isAdmin(actor) || item.assigneeId === actor.id;
}

/** 改派：ticket 才有；只有当前负责人或管理员；已关闭的不改派（要先重开） */
export function canAssign(actor: Actor, item: ItemRef): boolean {
	if (item.deletedAt || item.type !== "ticket" || item.status === "closed")
		return false;
	return isAdmin(actor) || item.assigneeId === actor.id;
}

export function allowedStatuses(actor: Actor, item: ItemRef): ItemStatus[] {
	if (item.deletedAt) return [];
	return nextStatuses(
		item.type,
		item.status,
		rolesOf(actor, item),
		isAdmin(actor),
	);
}

export function canTransition(
	actor: Actor,
	item: ItemRef,
	to: ItemStatus,
): boolean {
	return allowedStatuses(actor, item).includes(to);
}

/** 删除：ticket 的提单人、todo 的本人、管理员 */
export function canDelete(actor: Actor, item: ItemRef): boolean {
	if (item.deletedAt) return false;
	return isAdmin(actor) || item.reporterId === actor.id;
}

export function canRestore(actor: Actor, item: ItemRef): boolean {
	return item.deletedAt !== null && isAdmin(actor);
}

/** todo → ticket：本人或管理员，未关闭的才转 */
export function canConvert(actor: Actor, item: ItemRef): boolean {
	if (item.deletedAt || item.type !== "todo" || item.status === "closed")
		return false;
	return isAdmin(actor) || item.reporterId === actor.id;
}

/** 看得见就能评论；已关闭的也能（复盘），已删除的不能 */
export function canComment(actor: Actor, item: ItemRef): boolean {
	return item.deletedAt === null && canView(actor, item);
}

export interface CommentRef {
	authorId: string;
	deletedAt: Date | null;
}

export function canEditComment(actor: Actor, comment: CommentRef): boolean {
	return comment.deletedAt === null && comment.authorId === actor.id;
}

export function canDeleteComment(actor: Actor, comment: CommentRef): boolean {
	return (
		comment.deletedAt === null &&
		(comment.authorId === actor.id || isAdmin(actor))
	);
}

/** 前端按钮用：一次算齐 */
export function itemPermissions(actor: Actor, item: ItemRef) {
	return {
		edit: canEdit(actor, item),
		setPriority: canSetPriority(actor, item),
		assign: canAssign(actor, item),
		statuses: allowedStatuses(actor, item),
		delete: canDelete(actor, item),
		restore: canRestore(actor, item),
		convert: canConvert(actor, item),
		comment: canComment(actor, item),
	};
}
export type ItemPermissions = ReturnType<typeof itemPermissions>;
