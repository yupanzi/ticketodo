/**
 * 请求 id：`proxy.ts` 定下并写进请求头，下游（tRPC context、better-auth hook）从这里读，日志与审计同值。
 * 不 import 任何东西：proxy 也引它。
 */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * 沿用上游给的 id 的条件：信任代理（同 `trustsProxyHeaders`），且形状可控——ingress-nginx 给的是 32 位
 * hex，不只收 UUID；直连时来件能往审计里种任意值。
 */
const ACCEPTABLE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function resolveRequestId(
	incoming: string | null,
	trustProxy: boolean,
): string {
	return trustProxy && incoming && ACCEPTABLE_REQUEST_ID.test(incoming)
		? incoming
		: crypto.randomUUID();
}
