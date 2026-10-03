import { NextRequest } from "next/server";
export async function POST(request: NextRequest) {
	if (
		request.headers.get("origin") !== request.nextUrl.origin ||
		!request.headers.get("authorization")?.startsWith("Bearer ")
	)
		return new Response("Forbidden", { status: 403 });
	try {
		const input = await request.json();
		let path = "/api/v1/management/payg/balance";
		if (input.action === "cost") {
			if (
				!/^\d{6}$/.test(input.month) ||
				(input.apiKeyId && !/^[\w,-]{1,500}$/.test(input.apiKeyId))
			)
				return new Response("Invalid query", { status: 400 });
			const query = new URLSearchParams({
				type: "cost",
				query_dimension: "BIZ_MTH",
				query_time: input.month,
				bill_types: "metered,fallbackMetered",
			});
			if (input.apiKeyId) query.set("api_key_ids", input.apiKeyId);
			path = "/api/v1/management/cost?" + query;
		} else if (input.action !== "balance")
			return new Response("Unsupported management endpoint", { status: 400 });
		const response = await fetch("https://zenmux.ai" + path, {
			headers: { Authorization: request.headers.get("authorization")! },
			signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
			cache: "no-store",
		});
		return new Response(response.body, {
			status: response.status,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		});
	} catch {
		return new Response("Balance/cost query failed; amount unknown", {
			status: 502,
		});
	}
}
