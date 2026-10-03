import { expect, test, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/zenmux/management/route";
const request = (body: unknown, origin = "http://localhost:3000") =>
	new NextRequest("http://localhost:3000/api/zenmux/management", {
		method: "POST",
		headers: {
			Origin: origin,
			Authorization: "Bearer fixture-management",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
test("balance and PAYG cost use documented management endpoints and resource IDs", async () => {
	const result = () =>
		Response.json({
			success: true,
			data: { currency: "usd", total_credits: 5 },
		});
	const fetch = spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(result())
		.mockResolvedValueOnce(result());
	try {
		expect((await POST(request({ action: "balance" }))).status).toBe(200);
		expect(String(fetch.mock.calls[0][0])).toBe(
			"https://zenmux.ai/api/v1/management/payg/balance",
		);
		expect(
			(
				await POST(
					request({ action: "cost", month: "202610", apiKeyId: "resource-id" }),
				)
			).status,
		).toBe(200);
		const url = new URL(String(fetch.mock.calls[1][0]));
		expect(url.pathname).toBe("/api/v1/management/cost");
		expect(url.searchParams.get("bill_types")).toBe("metered,fallbackMetered");
		expect(url.searchParams.get("api_key_ids")).toBe("resource-id");
		expect(url.searchParams.get("query_dimension")).toBe("BIZ_MTH");
		expect(
			(await POST(request({ action: "balance" }, "https://evil.example")))
				.status,
		).toBe(403);
		expect(
			(await POST(request({ action: "cost", month: "invalid" }))).status,
		).toBe(400);
		expect(fetch).toHaveBeenCalledTimes(2);
	} finally {
		fetch.mockRestore();
	}
});
