interface Window {
	opencutDesktop?: {
		restartApp(): Promise<void>;
		setLanguage(language: "zh" | "en"): void;
		openRecordingPermissions(): Promise<void>;
		recordingPermissionStatus(): Promise<string>;
		recordingSources(): Promise<
			{
				id: string;
				name: string;
				thumbnail: string;
				kind: "screen" | "window";
			}[]
		>;
		selectRecordingSource(input: { id: string; audio: boolean }): Promise<void>;
		recordingCursor(): Promise<{ x: number; y: number } | null>;
		endRecording(): Promise<void>;
		beginRecordingControls(input: {
			pause: string;
			stop: string;
			language: "zh" | "en";
		}): Promise<void>;
		setRecordingPaused(paused: boolean): void;
		onRecordingAction(callback: (action: "pause" | "stop") => void): () => void;
	};
}
