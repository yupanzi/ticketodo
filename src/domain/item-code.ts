/**
 * 单号 `TK-YYYYMMDD-NNNN`：北京日期 + 当日序号（至少 4 位，超过照常变长）。ticket / todo 共用，
 * todo 转 ticket 单号不变。日期与序号都由建单事务里的 SQL 给出（`~/server/services/item-code`），
 * 这里只管格式。
 */

const CODE = /^TK-(\d{4})(\d{2})(\d{2})-(\d{4,})$/;

/** day 是 `YYYY-MM-DD` */
export function formatItemCode(day: string, seq: number): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(seq) || seq < 1)
		throw new Error(`单号参数不合法：${day} / ${seq}`);
	return `TK-${day.replaceAll("-", "")}-${String(seq).padStart(4, "0")}`;
}

export function parseItemCode(
	code: string,
): { day: string; seq: number } | null {
	const m = CODE.exec(code.trim().toUpperCase());
	if (!m) return null;
	const [, y, mo, d, seq] = m;
	return { day: `${y}-${mo}-${d}`, seq: Number(seq) };
}
