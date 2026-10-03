interface Window {
	opencutDesktop?: {
		credentialStatus(
			kind?: "generation" | "management",
		): Promise<{ saved: boolean; available: boolean; backend: string }>;
		saveCredential(
			value: string | { kind: "generation" | "management"; value: string },
		): Promise<void>;
		aiManagement(input: {
			action: "balance" | "cost";
			month?: string;
			apiKeyId?: string;
		}): Promise<any>;
		aiRequest(input: {
			id: string;
			path: string;
			body?: unknown;
		}): Promise<{ status: number; data: any; retryAfter: string | null }>;
		aiCancel(id: string): Promise<void>;
		aiMedia(input: {
			id: string;
			url: string;
		}): Promise<{ bytes: ArrayBuffer; mime: string }>;
		recordingBegin(input: {
			name: string;
			mime: string;
			primary: boolean;
		}): Promise<string>;
		recordingAppend(input: { id: string; bytes: ArrayBuffer }): Promise<void>;
		recordingFinish(id: string): Promise<RecordingRecoveryEntry>;
		recordingList(): Promise<RecordingRecoveryEntry[]>;
		recordingRead(
			id: string,
		): Promise<RecordingRecoveryEntry & { bytes: ArrayBuffer }>;
		recordingRemove(id: string): Promise<void>;
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
		setRecordingHealth(message: string): void;
		setRecordingPaused(paused: boolean): void;
		onRecordingAction(callback: (action: "pause" | "stop") => void): () => void;
	};
}

interface RecordingRecoveryEntry {
	id: string;
	name: string;
	mime: string;
	primary: boolean;
	created: number;
	complete: boolean;
	bytes: number;
}
