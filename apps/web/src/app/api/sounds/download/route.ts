import { type NextRequest, NextResponse } from "next/server";

// Platform network adapter: fetch Commons audio on the server to avoid browser CORS failures.
function allowed(url: URL) {
 return url.protocol === "https:" && url.hostname === "upload.wikimedia.org" &&
  !url.username && !url.password && (!url.port || url.port === "443") &&
  url.pathname.startsWith("/wikipedia/commons/");
}
export async function GET(request: NextRequest) {
 let url: URL;
 try { url = new URL(request.nextUrl.searchParams.get("url") ?? ""); }
 catch { return NextResponse.json({ error: "Unsupported sound source" }, { status: 400 }); }
 try {
  for (let redirects = 0; redirects < 5; redirects++) {
   if (!allowed(url)) return NextResponse.json({ error: "Unsupported sound source" }, { status: 400 });
   const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]), headers: { "User-Agent": "OpenCut-AI/1.0 (https://github.com/OpenCut-app/OpenCut)" } });
   if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
    await response.body?.cancel();
    url = new URL(response.headers.get("location")!, url); continue;
   }
   if (!response.ok) return NextResponse.json({ error: `Sound download failed (HTTP ${response.status})` }, { status: 502 });
   const type = response.headers.get("content-type")?.split(";")[0] ?? "";
   if (!(type.startsWith("audio/") || type === "application/ogg" || type === "application/octet-stream")) {
    await response.body?.cancel();
    return NextResponse.json({ error: "The source did not return an audio file" }, { status: 502 });
   }
   return new Response(response.body, { headers: { "Content-Type": type === "application/ogg" ? "audio/ogg" : type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  }
  return NextResponse.json({ error: "Too many sound source redirects" }, { status: 502 });
 } catch {
  return NextResponse.json({ error: "Unable to download this sound. Check your connection and retry." }, { status: 502 });
 }
}
