/// <reference types="bun" />
import { expect, test, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/zenmux/route";
import { POST as download } from "../../app/api/zenmux/media/route";
function request({
	body,
	origin = "http://localhost:3000",
}: {
	body: unknown;
	origin?: string;
}) {
	return new NextRequest("http://localhost:3000/api/zenmux", {
		method: "POST",
		headers: {
			Origin: origin,
			Authorization: "Bearer test-only-key",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}
test("forwards approved ZenMux endpoints and rejects other origins", async () => {
	const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
		Response.json({ id: "job", status: "queued" }),
	);
	try {
		const response = await POST(
			request({
				body: {
					path: "/api/v1/videos",
					body: { model: "minimax/minimax-h3-max" },
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: "job", status: "queued" });
		expect(fetch.mock.calls[0][0]).toBe("https://zenmux.ai/api/v1/videos");
		expect(fetch.mock.calls[0][1]?.headers).toEqual({
			Authorization: "Bearer test-only-key",
			"Content-Type": "application/json",
		});
		expect(
			(await POST(request({ body: { path: "https://attacker.test" } }))).status,
		).toBe(400);
		expect(
			(
				await POST(
					request({
						body: { path: "/api/v1/videos" },
						origin: "https://attacker.test",
					}),
				)
			).status,
		).toBe(403);
		expect(fetch).toHaveBeenCalledTimes(1);
	} finally {
		fetch.mockRestore();
	}
});
test("video polling uses GET and preserves upstream failures", async () => {
	const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
		Response.json({ error: { message: "Invalid model" } }, { status: 400 }),
	);
	try {
		const response = await POST(
			request({ body: { path: "/api/v1/videos/job-123" } }),
		);
		expect(fetch.mock.calls[0][1]?.method).toBe("GET");
		expect(response.status).toBe(400);
	} finally {
		fetch.mockRestore();
	}
});
test("media proxy rejects internal hosts and redirect escapes", async () => {
	const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(null, {
			status: 302,
			headers: { location: "http://127.0.0.1/private" },
		}),
	);
	try {
		expect(
			(await download(request({ body: { url: "http://127.0.0.1/private" } })))
				.status,
		).toBe(400);
		expect(fetch).toHaveBeenCalledTimes(0);
		expect(
			(
				await download(
					request({ body: { url: "https://storage.googleapis.com/test.mp4" } }),
				)
			).status,
		).toBe(400);
		expect(fetch).toHaveBeenCalledTimes(1);
	} finally {
		fetch.mockRestore();
	}
});

test("media connection errors report a safe diagnostic without signed URLs", async () => {
	const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
		Object.assign(new Error("private signed URL must not escape"), {
			cause: { code: "ECONNRESET" },
		}),
	);
	try {
		const response = await download(
			request({ body: { url: "https://fal.media/test.mp4?token=private" } }),
		);
		expect(response.status).toBe(502);
		const detail = await response.text();
		expect(detail).toContain("ECONNRESET");
		expect(detail).not.toContain("private");
	} finally {
		fetch.mockRestore();
	}
});

test("generation connection errors expose only a safe diagnostic", async () => {
	const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
		Object.assign(new Error("private prompt and key"), {
			cause: { code: "ECONNRESET" },
		}),
	);
	try {
		const response = await POST(request({ body: { path: "/api/v1/videos" } }));
		expect(response.status).toBe(502);
		const detail = await response.text();
		expect(detail).toContain("ECONNRESET");
		expect(detail).not.toContain("private");
		expect(fetch).toHaveBeenCalledTimes(1);
	} finally {
		fetch.mockRestore();
	}
});
test("generation timeouts are distinguished from network failures", async () => {
	const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
		new DOMException("timeout", "TimeoutError"),
	);
	try {
		const response = await POST(
			request({ body: { path: "/api/v1/videos/job-123" } }),
		);
		expect(response.status).toBe(504);
		expect((await response.json()).error.code).toBe("UPSTREAM_TIMEOUT");
	} finally {
		fetch.mockRestore();
	}
});
