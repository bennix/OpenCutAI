"use client";
import {
	Children,
	type ReactNode,
	useCallback,
	useEffect,
	useSyncExternalStore,
} from "react";
import { getLocale, setLocale, subscribeLocale, type Locale } from "./locale";
import { translate } from "./messages";
export { getLocale, setLocale } from "./locale";
export function useLocale(): Locale {
	return useSyncExternalStore(subscribeLocale, getLocale, () => "zh");
}
export function useTranslation() {
	const locale = useLocale();
	return useCallback((text: string) => translate({ text, locale }), [locale]);
}
export function UiText({ text }: { text: string }) {
	const t = useTranslation();
	return t(text);
}
export function LanguageSetting() {
	const locale = useLocale();
	const t = useTranslation();
	useEffect(() => {
		document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
		window.opencutDesktop?.setLanguage(locale);
	}, [locale]);
	return (
		<div className="space-y-2">
			<label className="block" htmlFor="opencut-language">
				{t("Language")}
			</label>
			<select
				id="opencut-language"
				className="w-full rounded border bg-background p-2"
				value={locale}
				onChange={(event) =>
					setLocale(event.target.value === "en" ? "en" : "zh")
				}
			>
				<option value="zh">中文</option>
				<option value="en">English</option>
			</select>
			<p className="text-xs text-muted-foreground">
				{t(
					"AI follows this language for summaries and text in generated media. Your original prompt is preserved.",
				)}
			</p>
		</div>
	);
}

export function LocaleDocument() {
	const locale = useLocale();
	useEffect(() => {
		document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
		window.opencutDesktop?.setLanguage(locale);
	}, [locale]);
	return null;
}

export function localize(text: string) {
	return translate({ text, locale: getLocale() });
}

export function UiLabels({ children }: { children: ReactNode }) {
	return Children.map(children, (child) =>
		typeof child === "string" ? <UiText text={child} /> : child,
	);
}
