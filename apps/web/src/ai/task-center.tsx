"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { toast } from "sonner";
import {
	loadTasks,
	cachedTasks,
	attachProviderTask,
	updateTask,
	type GenerationTask,
} from "./tasks";
import { generate } from "./editor-adapter";
const names = {
	submitting: "提交结果待核对",
	unknown: "提交结果未知",
	submitted: "等待生成",
	downloading: "下载待完成",
	saved: "已保存素材",
	completed: "已完成",
	failed: "失败",
	acknowledged: "已确认关闭",
};
export function TaskCenter() {
	const editor = useEditor();
	const [tasks, setTasks] = useState<GenerationTask[]>([]);
	const [running, setRunning] = useState<string>();
	const abort = useRef<AbortController | null>(null);
	useEffect(() => {
		const changed = () =>
			setTasks([...cachedTasks()].sort((a, b) => b.created - a.created));
		window.addEventListener("opencut-tasks", changed);
		void loadTasks()
			.then(changed)
			.catch((e) => toast.error(String(e)));
		return () => {
			window.removeEventListener("opencut-tasks", changed);
			abort.current?.abort();
		};
	}, []);
	return (
		<section className="space-y-3 border-t pt-4">
			<h4 className="font-medium">生成任务中心</h4>
			<p className="text-xs text-muted-foreground">
				查询、下载和恢复不会重新提交收费任务。结果未知时请先在 ZenMux 核对记录。
			</p>
			{tasks.length === 0 && <p>暂无任务</p>}
			{tasks.map((task) => (
				<div key={task.id} className="rounded border p-2 space-y-2">
					<p>
						{names[task.state]} · {task.input.model}
					</p>
					<p className="text-xs truncate">{task.input.prompt}</p>
					{task.providerId && (
						<p className="text-xs break-all">任务 ID：{task.providerId}</p>
					)}
					{task.error && (
						<p className="text-xs text-destructive">{task.error}</p>
					)}
					<div className="flex flex-wrap gap-2">
						{!["completed", "failed", "acknowledged"].includes(task.state) &&
							(task.providerId || task.response || task.assetId) && (
								<Button
									size="sm"
									disabled={!!running}
									onClick={async () => {
										if (
											editor.project.getActive().metadata.id !== task.projectId
										) {
											toast.error("请先打开此任务所属项目");
											return;
										}
										setRunning(task.id);
										const controller = new AbortController();
										abort.current = controller;
										try {
											await generate({
												editor,
												input: { ...task.input, newVersion: false },
												recoverTaskId: task.id,
												signal: controller.signal,
												status: (s) => setRunning(task.id),
											});
											toast.success("任务已恢复");
										} catch (e) {
											if (!controller.signal.aborted)
												toast.error(e instanceof Error ? e.message : String(e));
										} finally {
											setRunning(undefined);
											abort.current = null;
										}
									}}
								>
									恢复查询 / 下载
								</Button>
							)}
						{task.state === "completed" && task.input.kind !== "edit" && (
							<Button
								size="sm"
								variant="outline"
								disabled={!!running}
								onClick={async () => {
									if (
										editor.project.getActive().metadata.id !== task.projectId
									) {
										toast.error("请先打开此任务所属项目");
										return;
									}
									if (
										!window.confirm(
											"生成新版本会提交新的收费请求，旧版本保留在素材库。确认继续？",
										)
									)
										return;
									setRunning(task.id);
									const controller = new AbortController();
									abort.current = controller;
									try {
										await generate({
											editor,
											input: { ...task.input, newVersion: true },
											signal: controller.signal,
											status: () => {},
										});
										toast.success(
											"新版本已保存，旧版本保留，可在 AI 素材库预览和复用",
										);
									} catch (e) {
										if (!controller.signal.aborted) toast.error(String(e));
									} finally {
										setRunning(undefined);
										abort.current = null;
									}
								}}
							>
								生成新版本
							</Button>
						)}
						{running === task.id && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => abort.current?.abort()}
							>
								停止等待
							</Button>
						)}
						{["unknown", "submitting"].includes(task.state) &&
							!task.providerId && (
								<>
									<Button
										size="sm"
										variant="outline"
										onClick={async () => {
											const id = window.prompt(
												"输入在 ZenMux 核对到的视频任务 ID",
											);
											if (id)
												try {
													await attachProviderTask(task.id, id.trim());
												} catch (e) {
													toast.error(String(e));
												}
										}}
									>
										关联服务商任务
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={async () => {
											if (
												window.confirm(
													"确认已在服务商核对：此请求没有成功提交，或你接受再次生成可能重复扣费？确认后解除重复提交保护。",
												)
											)
												await updateTask(task.id, { state: "acknowledged" });
										}}
									>
										核对后解除保护
									</Button>
								</>
							)}
					</div>
				</div>
			))}
		</section>
	);
}
