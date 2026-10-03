export type Locale = "zh" | "en";
export function getLocale(): Locale {
	return typeof localStorage !== "undefined" &&
		localStorage.getItem("opencut-language") === "en"
		? "en"
		: "zh";
}
export function setLocale(locale: Locale) {
	localStorage.setItem("opencut-language", locale);
	window.dispatchEvent(new Event("opencut-language"));
}
export function subscribeLocale(callback: () => void) {
	window.addEventListener("opencut-language", callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener("opencut-language", callback);
		window.removeEventListener("storage", callback);
	};
}
