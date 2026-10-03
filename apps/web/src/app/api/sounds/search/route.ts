import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SoundEffect } from "@/sounds/types";

const parameters = z.object({ q: z.string().max(300).default("sound effect"), page: z.coerce.number().int().min(1).max(100).default(1), commercial_only: z.enum(["true", "false"]).default("false"), page_size: z.coerce.number().int().min(1).max(50).default(20) });
const plain = (text: string) => text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
interface CommonsInfo {
	url: string; descriptionurl: string; size: number; duration?: number; mime: string;
	extmetadata: Record<string, { value: string }>;
}
interface CommonsPage { pageid: number; title: string; index?: number; imageinfo?: CommonsInfo[] }
export async function GET(request: NextRequest) {
	const parsed = parameters.safeParse(Object.fromEntries(request.nextUrl.searchParams));
	if (!parsed.success) return NextResponse.json({ error: "Invalid sound search" }, { status: 400 });
	const { q, page, commercial_only: cc0Only, page_size: pageSize } = parsed.data;
	const query = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `${q || "sound effect"} filetype:audio`, gsrnamespace: "6", gsrlimit: String(pageSize), gsroffset: String((page - 1) * pageSize), prop: "imageinfo", iiprop: "url|size|mime|extmetadata" });
	try {
		const response = await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, { headers: { "User-Agent": "OpenCut-AI/1.0 (https://github.com/OpenCut-app/OpenCut)" }, signal: AbortSignal.timeout(20000), next: { revalidate: 3600 } });
		if (!response.ok) throw new Error(`Wikimedia Commons HTTP ${response.status}`);
		const data = await response.json();
		if (data.error) throw new Error(data.error.info ?? "Sound search unavailable");
		const pages = Object.values(data.query?.pages ?? {}) as CommonsPage[];
		const results: SoundEffect[] = pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).flatMap((item) => {
			const info = item.imageinfo?.[0];
			if (!info || !(info.mime.startsWith("audio/") || info.mime === "application/ogg")) return [];
			const meta = info.extmetadata;
			const license = plain(meta.LicenseShortName?.value ?? "");
			if (cc0Only === "true" && !/^(CC0|Public domain)/i.test(license)) return [];
			if (!/^(CC0|CC BY(?:-SA)?(?: |$)|Public domain)/i.test(license)) return [];
			const url = new URL(info.url); url.search = "";
			return [{ id: -item.pageid, name: item.title.replace(/^File:/, ""), description: plain(meta.ImageDescription?.value ?? ""), url: info.descriptionurl, previewUrl: url.href, downloadUrl: url.href, duration: info.duration ?? 0, filesize: info.size, type: info.mime, channels: 0, bitrate: 0, bitdepth: 0, samplerate: 0, username: plain(meta.Artist?.value ?? meta.Credit?.value ?? "Wikimedia Commons"), tags: [], license, licenseUrl: meta.LicenseUrl?.value, created: plain(meta.DateTimeOriginal?.value ?? ""), downloads: 0, rating: 0, ratingCount: 0 }];
		});
		return NextResponse.json({ results, count: results.length, next: data.continue ? `/api/sounds/search?q=${encodeURIComponent(q)}&page=${page + 1}&page_size=${pageSize}` : null, previous: page > 1 ? `/api/sounds/search?page=${page - 1}` : null, page, pageSize, type: "effects" });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Sound search unavailable" }, { status: 502 });
	}
}
