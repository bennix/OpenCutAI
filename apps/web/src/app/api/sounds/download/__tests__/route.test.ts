import { afterEach, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "../route";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const url = "https://upload.wikimedia.org/wikipedia/commons/a/ab/example.ogg";
const request = (source: string) => new NextRequest(`http://localhost:3015/api/sounds/download?url=${encodeURIComponent(source)}`);

test("streams Commons audio through the same-origin endpoint", async () => {
 globalThis.fetch = (async () => new Response(new Uint8Array([79, 103, 103, 83]), { headers: { "Content-Type": "application/ogg" } })) as unknown as typeof fetch;
 const response = await GET(request(url));
 expect(response.status).toBe(200);
 expect(response.headers.get("content-type")).toBe("audio/ogg");
 expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([79, 103, 103, 83]);
});
test("rejects unrelated URLs and redirects before fetching them", async () => {
 let calls = 0;
 globalThis.fetch = (async () => { calls++; return new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } }); }) as unknown as typeof fetch;
 expect((await GET(request("https://example.com/audio.ogg"))).status).toBe(400);
 expect(calls).toBe(0);
 expect((await GET(request(url))).status).toBe(400);
 expect(calls).toBe(1);
});
test("reports invalid sources, upstream failures and non-audio responses", async () => {
 expect((await GET(request(""))).status).toBe(400);
 globalThis.fetch = (async () => new Response("missing", { status: 404 })) as unknown as typeof fetch;
 expect((await GET(request(url))).status).toBe(502);
 globalThis.fetch = (async () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } })) as unknown as typeof fetch;
 expect((await GET(request(url))).status).toBe(502);
});
