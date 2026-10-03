export function formatDate({ date, locale = "en" }: { date: Date; locale?: "zh" | "en" }): string {
	return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
