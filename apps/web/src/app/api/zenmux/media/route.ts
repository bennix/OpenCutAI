import { NextRequest } from "next/server";
// Only public provider CDNs; never follow a redirect outside this allowlist.
const CDN_HOSTS = [
	"storage.googleapis.com",
	"marmot-cloud.com",
	"fal.media",
	"fal.ai",
	"cloudfront.net",
	"bfl.ai",
	"minimax.io",
	"hailuoai.com",
	"volcengineapi.com",
	"byteintlapi.com",
	"ufileos.com",
	"agnes-ai.space",
];
function allowed(url: URL) {
	return (
		url.protocol === "https:" &&
		!url.username &&
		!url.password &&
		(!url.port || url.port === "443") &&
		CDN_HOSTS.some(
			(host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
		)
	);
}
export async function POST(request: NextRequest) {
	if (
		request.headers.get("origin") !== request.nextUrl.origin ||
		!request.headers.get("authorization")?.startsWith("Bearer ")
	)
		return new Response("Forbidden", { status: 403 });
	try {
		let url = new URL((await request.json()).url);
		for (let count = 0; count < 5; count++) {
			if (!allowed(url))
				return new Response("Unsupported media CDN", { status: 400 });
			const response = await fetch(url, {
				redirect: "manual",
				signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
				cache: "no-store",
			});
			if (
				response.status >= 300 &&
				response.status < 400 &&
				response.headers.has("location")
			) {
				url = new URL(response.headers.get("location")!, url);
				continue;
			}
			return new Response(response.body, {
				status: response.status,
				headers: {
					"Content-Type":
						response.headers.get("content-type") ?? "application/octet-stream",
					"Cache-Control": "no-store",
				},
			});
		}
		return new Response("Too many redirects", { status: 502 });
	} catch (error) {
		const cause =
			error instanceof Error
				? (error as Error & { cause?: { code?: string } }).cause?.code
				: undefined;
		const reason =
			error instanceof Error && error.name === "TimeoutError"
				? "CDN download timed out"
				: "CDN connection failed";
		return new Response(
			`${reason}${cause && /^[A-Z_]+$/.test(cause) ? ` (${cause})` : ""}; retry downloads the existing generated media`,
			{ status: 502 },
		);
	}
}
