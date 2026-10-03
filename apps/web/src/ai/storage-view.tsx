"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	libraryUsage,
	pageGeneratedAssets,
	deleteGeneratedAsset,
	type GeneratedAsset,
} from "./library";
import { listSpools } from "@/recording/spool";
import { toast } from "sonner";
function download(asset: GeneratedAsset) {
	const url = URL.createObjectURL(asset.blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = asset.name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function StorageView() {
	const [usage, setUsage] = useState("");
	const [assets, setAssets] = useState<GeneratedAsset[]>([]);
	const [offset, setOffset] = useState(0);
	const refresh = async (page = offset) => {
		const [library, recovery, storage] = await Promise.all([
			libraryUsage(),
			listSpools(),
			navigator.storage?.estimate?.(),
		]);
		const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		setUsage(
			`AI 素材 ${library.count} 个 / ${mb(library.bytes)}；录屏恢复 ${recovery.length} 个 / ${mb(recovery.reduce((sum, item) => sum + item.bytes, 0))}${storage?.quota ? `；浏览器已用 ${mb(storage.usage ?? 0)} / 配额 ${mb(storage.quota)}` : ""}`,
		);
		setAssets(await pageGeneratedAssets(20, page));
	};
	useEffect(() => {
		void refresh().catch((e) => toast.error(String(e)));
	}, []);
	return (
		<section className="space-y-3 border-t pt-4">
			<h4 className="font-medium">本地素材与恢复空间</h4>
			<p className="text-xs">{usage}</p>
			<p className="text-xs text-muted-foreground">
				素材保留在本机。清理前可下载备份；分镜、角色参考或待恢复任务正在引用的素材会阻止删除。录屏恢复文件在录屏面板管理。
			</p>
			<Button
				variant="outline"
				onClick={() => void refresh().catch((e) => toast.error(String(e)))}
			>
				刷新空间统计
			</Button>
			{assets.map((asset) => (
				<div
					key={asset.id}
					className="flex flex-wrap gap-2 items-center border rounded p-2"
				>
					<span className="text-xs break-all flex-1">
						{asset.name} · {(asset.blob.size / 1024 / 1024).toFixed(1)} MB
					</span>
					<Button size="sm" variant="outline" onClick={() => download(asset)}>
						下载备份
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={async () => {
							if (!confirm("确认删除 AI 库中的原文件？请先下载备份。")) return;
							try {
								await deleteGeneratedAsset(asset.id);
								await refresh();
							} catch (e) {
								toast.error(e instanceof Error ? e.message : String(e));
							}
						}}
					>
						清理
					</Button>
				</div>
			))}
			<div className="flex gap-2">
				<Button
					disabled={offset === 0}
					variant="outline"
					onClick={() => {
						const next = Math.max(0, offset - 20);
						setOffset(next);
						void refresh(next);
					}}
				>
					上一页
				</Button>
				<Button
					disabled={assets.length < 20}
					variant="outline"
					onClick={() => {
						setOffset(offset + 20);
						void refresh(offset + 20);
					}}
				>
					下一页
				</Button>
			</div>
		</section>
	);
}
