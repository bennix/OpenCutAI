import { NextRequest } from "next/server";
// Same-origin transport avoids browser CORS. Never persist or log credentials.
export async function POST(request: NextRequest) {
	if (request.headers.get("origin") !== request.nextUrl.origin)
		return new Response("Forbidden", { status: 403 });
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer "))
		return new Response("Unauthorized", { status: 401 });
	try {
		const { path, body } = await request.json();
		if (
			typeof path !== "string" ||
			!/^\/api\/(v1\/(chat\/completions|images\/generations|models|videos(?:\/[\w-]+)?|interactions)|vertex-ai\/v1\/publishers\/[\w-]+\/models\/[\w.-]+:generateContent)$/.test(
				path,
			)
		) {
			return Response.json(
				{ error: { message: "Unsupported ZenMux endpoint" } },
				{ status: 400 },
			);
		}
		const response = await fetch(`https://zenmux.ai${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers: {
				Authorization: authorization,
				"Content-Type": "application/json",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.any([request.signal, AbortSignal.timeout(600_000)]),
			cache: "no-store",
		});
		return new Response(response.body, {
			status: response.status,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		});
	} catch (error) {
		const cause =
			error instanceof Error
				? (error as Error & { cause?: { code?: string } }).cause?.code
				: undefined;
		const timedOut = error instanceof Error && error.name === "TimeoutError";
		const reason = timedOut
			? "ZenMux 请求超时（10 分钟）"
			: "ZenMux 网络连接失败";
		// Only expose a bounded error code, never URLs, request bodies or keys.
		const code =
			typeof cause === "string" && /^[A-Z_]{1,64}$/.test(cause)
				? ` (${cause})`
				: "";
		return Response.json(
			{
				error: {
					message: `${reason}${code}`,
					code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_CONNECTION_FAILED",
				},
			},
			{ status: timedOut ? 504 : 502 },
		);
	}
}
