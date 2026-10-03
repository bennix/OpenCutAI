"use client";
import { UiText, useTranslation } from "@/i18n";


import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { fetchSoundFile, importSoundFiles } from "@/sounds/transfer";
import { downloadBlob } from "@/utils/browser";
import { useFileUpload } from "@/media/use-file-upload";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSoundSearch } from "@/sounds/use-sound-search";
import { useSoundsStore } from "@/sounds/sounds-store";
import type { SavedSound, SoundEffect } from "@/sounds/types";
import { cn } from "@/utils/ui";
import {
	FavouriteIcon,
	FilterMailIcon,
	PauseIcon,
	PlayIcon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function SoundsView() {
	return (
		<div className="flex h-full flex-col">
			<ImportSoundButton />
			<Tabs defaultValue="sound-effects" className="flex h-full flex-col">
				<div className="px-3 pt-4 pb-0">
					<TabsList>
						<TabsTrigger value="sound-effects"><UiText text="Sound effects" /></TabsTrigger>
						<TabsTrigger value="saved"><UiText text="Saved" /></TabsTrigger>
					</TabsList>
				</div>
				<Separator className="my-4" />
				<TabsContent
					value="sound-effects"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<SoundEffectsView />
				</TabsContent>
				<TabsContent
					value="saved"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<SavedSoundsView />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function ImportSoundButton() {
 const t = useTranslation();
 const [busy, setBusy] = useState(false);
 const { openFilePicker, fileInputProps } = useFileUpload({ accept: "audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aiff,.opus", multiple: true, onFilesSelected: async files => {
  setBusy(true);
  try { await importSoundFiles(files); toast.success(t("Sound added to timeline")); }
  catch (error) { toast.error(t(error instanceof Error ? error.message : "Failed to add sound to timeline")); }
  finally { setBusy(false); }
 } });
 return <div className="px-5 pt-4"><input {...fileInputProps} /><Button variant="outline" className="w-full" disabled={busy} onClick={openFilePicker}>{busy && <Loader2 className="size-4 animate-spin" />}{t(busy ? "Adding sound..." : "Import local sound")}</Button><p className="mt-2 text-xs text-muted-foreground">{t("Audio is saved in the project and added at the playhead. Multiple files are placed in order.")}</p></div>;
}

function SoundEffectsView() {
	const t = useTranslation();
	const {
		topSoundEffects,
		isLoading,
		error: loadError,
		searchQuery,
		setSearchQuery,
		scrollPosition,
		setScrollPosition,
		loadSavedSounds,
		showCommercialOnly,
		toggleCommercialFilter,
		hasLoaded,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	} = useSoundsStore();
	const {
		results: searchResults,
		isLoading: isSearching,
		error: searchError,
		loadMore,
		hasNextPage,
		isLoadingMore,
	} = useSoundSearch({
		query: searchQuery,
		commercialOnly: showCommercialOnly,
	});

	const [playingId, setPlayingId] = useState<number | null>(null);
	const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
	useEffect(() => () => { audioElement?.pause(); }, [audioElement]);

	const { scrollAreaRef, handleScroll } = useInfiniteScroll({
		onLoadMore: loadMore,
		hasMore: hasNextPage,
		isLoading: isLoadingMore || isSearching,
	});

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	useEffect(() => {
		if (hasLoaded) {
			return;
		}

		let shouldIgnore = false;

		const fetchTopSounds = async () => {
			try {
				if (!shouldIgnore) {
					setLoading({ loading: true });
					setError({ error: null });
				}

				const response = await fetch(
					`/api/sounds/search?page_size=20&commercial_only=${showCommercialOnly}`,
				);

				if (!shouldIgnore) {
					if (!response.ok) {
						const failure = await response.json().catch(() => null);
						throw new Error(failure?.error ?? `Failed to fetch: ${response.status}`);
					}

					const data = await response.json();
					setTopSoundEffects({ sounds: data.results });
					setHasLoaded({ loaded: true });

					setCurrentPage({ page: 1 });
					setHasNextPage({ hasNext: !!data.next });
					setTotalCount({ count: data.count });
				}
			} catch (error) {
				if (!shouldIgnore) {
					console.error("Failed to fetch top sounds:", error);
					setError({
						error:
							error instanceof Error ? error.message : "Failed to load sounds",
					});
				}
			} finally {
				if (!shouldIgnore) {
					setLoading({ loading: false });
				}
			}
		};

		const timeoutId = setTimeout(fetchTopSounds, 100, {});

		return () => {
			shouldIgnore = true;
			clearTimeout(timeoutId);
		};
	}, [
		hasLoaded,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
		showCommercialOnly,
	]);

	useEffect(() => {
		if (!scrollAreaRef.current || scrollPosition <= 0) {
			return;
		}

		const restoreScrollPosition = () => {
			scrollAreaRef.current?.scrollTo({ top: scrollPosition });
		};

		const timeoutId = setTimeout(restoreScrollPosition, 100, {});

		return () => clearTimeout(timeoutId);
	}, [scrollPosition, scrollAreaRef]);

	const handleScrollWithPosition = ({
		currentTarget,
	}: React.UIEvent<HTMLDivElement>) => {
		const { scrollTop } = currentTarget;
		setScrollPosition({ position: scrollTop });
		handleScroll({ currentTarget } as React.UIEvent<HTMLDivElement>);
	};

	const displayedSounds = searchQuery ? searchResults : topSoundEffects;

	const playSound = ({ sound }: { sound: SoundEffect }) => {
		if (playingId === sound.id) {
			audioElement?.pause();
			setPlayingId(null);
			return;
		}

		audioElement?.pause();

		if (sound.previewUrl) {
			const audio = new Audio(`/api/sounds/download?url=${encodeURIComponent(sound.previewUrl)}`);
			audio.addEventListener("ended", () => {
				setPlayingId(null);
			});
			audio.addEventListener("error", () => {
				setPlayingId(null);
			});
			audio.play().catch((error) => {
				console.error("Failed to play sound preview:", error);
				setPlayingId(null);
			});

			setAudioElement(audio);
			setPlayingId(sound.id);
		}
	};

	return (
		<div className="mt-1 flex h-full flex-col gap-5">
			<p className="text-xs text-muted-foreground"><UiText text="Openly licensed audio from Wikimedia Commons. Attribution may be required; check the source license." /></p>
			<div className="flex items-center gap-3">
				<Input
					placeholder={t("Search sound effects")}
					className="w-full"
					containerClassName="w-full"
					value={searchQuery}
					onChange={({ currentTarget }) =>
						setSearchQuery({ query: currentTarget.value })
					}
					showClearIcon
					onClear={() => setSearchQuery({ query: "" })}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="text"
							size="icon"
							className={cn(showCommercialOnly && "text-primary")}
						>
							<HugeiconsIcon icon={FilterMailIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuCheckboxItem
							checked={showCommercialOnly}
							onCheckedChange={() => { toggleCommercialFilter(); setHasLoaded({ loaded: false }); }}
						>
							<UiText text="CC0 / public domain only" /></DropdownMenuCheckboxItem>
						<div className="text-muted-foreground px-2 py-1.5 text-xs">
							{showCommercialOnly
								? "No attribution required: CC0 and public domain"
								: "Open licenses only: CC0, public domain, CC BY and CC BY-SA"}
						</div>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{(searchQuery ? searchError : loadError) && <div role="alert" className="space-y-2 rounded border p-3 text-sm"><p>{t("Unable to load online sounds. You can import local audio or retry.")}</p><p className="text-xs text-muted-foreground">{searchQuery ? searchError : loadError}</p><Button variant="outline" size="sm" onClick={() => { setHasLoaded({ loaded: false }); useSoundsStore.getState().setLastSearchQuery({ query: "" }); useSoundsStore.getState().setSearchResults({ results: [] }); }}>{t("Retry")}</Button></div>}
			<div className="relative h-full overflow-hidden">
				<ScrollArea
					className="h-full flex-1"
					ref={scrollAreaRef}
					onScrollCapture={handleScrollWithPosition}
				>
					<div className="flex flex-col gap-4">
						{isLoading && !searchQuery && (
							<div className="text-muted-foreground text-sm">
								<UiText text="Loading sounds..." /></div>
						)}
						{isSearching && searchQuery && (
							<div className="text-muted-foreground text-sm"><UiText text="Searching..." /></div>
						)}
						{displayedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={sound}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
							/>
						))}
						{!isLoading && !isSearching && displayedSounds.length === 0 && (
							<div className="text-muted-foreground text-sm">
								{t(searchQuery ? "No sounds found" : "No sounds available")}
							</div>
						)}
						{isLoadingMore && (
							<div className="text-muted-foreground py-4 text-center text-sm">
								<UiText text="Loading more sounds..." /></div>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

function SavedSoundsView() {
	const {
		savedSounds,
		isLoadingSavedSounds,
		savedSoundsError,
		loadSavedSounds,
		clearSavedSounds,
	} = useSoundsStore();

	const [playingId, setPlayingId] = useState<number | null>(null);
	const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
	useEffect(() => () => { audioElement?.pause(); }, [audioElement]);

	const [showClearDialog, setShowClearDialog] = useState(false);

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	const playSound = ({ sound }: { sound: SoundEffect }) => {
		if (playingId === sound.id) {
			audioElement?.pause();
			setPlayingId(null);
			return;
		}

		audioElement?.pause();

		if (sound.previewUrl) {
			const audio = new Audio(`/api/sounds/download?url=${encodeURIComponent(sound.previewUrl)}`);
			audio.addEventListener("ended", () => {
				setPlayingId(null);
			});
			audio.addEventListener("error", () => {
				setPlayingId(null);
			});
			audio.play().catch((error) => {
				console.error("Failed to play sound preview:", error);
				setPlayingId(null);
			});

			setAudioElement(audio);
			setPlayingId(sound.id);
		}
	};

	const convertToSoundEffect = ({
		savedSound,
	}: {
		savedSound: SavedSound;
	}): SoundEffect => ({
		id: savedSound.id,
		name: savedSound.name,
		description: "",
		url: savedSound.sourceUrl ?? "",
		licenseUrl: savedSound.licenseUrl,
		previewUrl: savedSound.previewUrl,
		downloadUrl: savedSound.downloadUrl,
		duration: savedSound.duration,
		filesize: 0,
		type: "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: savedSound.username,
		tags: savedSound.tags,
		license: savedSound.license,
		created: savedSound.savedAt,
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	});

	if (isLoadingSavedSounds) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-muted-foreground text-sm">
					<UiText text="Loading saved sounds..." /></div>
			</div>
		);
	}

	if (savedSoundsError) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-destructive text-sm">
					<UiText text={"Error:"} />{savedSoundsError}
				</div>
			</div>
		);
	}

	if (savedSounds.length === 0) {
		return (
			<div className="bg-background flex h-full flex-col items-center justify-center gap-3 p-4">
				<HugeiconsIcon
					icon={FavouriteIcon}
					className="text-muted-foreground size-10"
				/>
				<div className="flex flex-col gap-2 text-center">
					<p className="text-lg font-medium"><UiText text="No saved sounds" /></p>
					<p className="text-muted-foreground text-sm text-balance">
						<UiText text="Click the heart icon on any sound to save it here" /></p>
				</div>
			</div>
		);
	}

	return (
		<div className="mt-1 flex h-full flex-col gap-5">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					{savedSounds.length} saved{" "}
					{savedSounds.length === 1 ? "sound" : "sounds"}
				</p>
				<Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
					<DialogTrigger asChild>
						<Button
							variant="text"
							size="sm"
							className="text-muted-foreground hover:text-destructive h-auto !opacity-100"
						>
							<UiText text="Clear all" /></Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle><UiText text="Clear all saved sounds?" /></DialogTitle>
							<DialogDescription>
								<UiText text={"This will permanently remove all"} />{savedSounds.length} <UiText text={"saved sounds from your collection. This action cannot be undone."} /></DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="text" onClick={() => setShowClearDialog(false)}>
								<UiText text="Cancel" /></Button>
							<Button
								variant="destructive"
								onClick={async (event: React.MouseEvent<HTMLButtonElement>) => {
									event.stopPropagation();
									await clearSavedSounds();
									setShowClearDialog(false);
								}}
							>
								<UiText text="Clear all sounds" /></Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="relative h-full overflow-hidden">
				<ScrollArea className="h-full flex-1">
					<div className="flex flex-col gap-4">
						{savedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={convertToSoundEffect({ savedSound: sound })}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
							/>
						))}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

interface AudioItemProps {
	sound: SoundEffect;
	isPlaying: boolean;
	onPlay: ({ sound }: { sound: SoundEffect }) => void;
}

function AudioItem({ sound, isPlaying, onPlay }: AudioItemProps) {
	const t = useTranslation();
	const { addSoundToTimeline, isSoundSaved, toggleSavedSound } =
		useSoundsStore();
	const isSaved = isSoundSaved({ soundId: sound.id });
	const [busy, setBusy] = useState<"add" | "download" | null>(null);
	const busyRef = useRef(false);
	const [failure, setFailure] = useState<string | null>(null);

	const handleClick = () => {
		onPlay({ sound });
	};

	const handleSaveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		toggleSavedSound({ soundEffect: sound });
	};

	const handleAddToTimeline = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		if (busyRef.current) return;
		busyRef.current = true; setBusy("add"); setFailure(null);
		try {
			if (await addSoundToTimeline({ sound })) toast.success(t("Sound added to timeline"));
			else setFailure(t("Unable to add this sound. Retry or download and import it locally."));
		} finally { busyRef.current = false; setBusy(null); }
	};

	return (
		<div className="rounded-md border p-3">
		<div className="group flex items-center gap-3">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
				onClick={handleClick}
			>
				<div className="bg-accent relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
					<div className="from-primary/20 absolute inset-0 bg-gradient-to-br to-transparent" />
					{isPlaying ? (
						<HugeiconsIcon icon={PauseIcon} className="size-5" />
					) : (
						<HugeiconsIcon icon={PlayIcon} className="size-5" />
					)}
				</div>

				<div className="min-w-0 flex-1 overflow-hidden">
					<p className="truncate text-sm font-medium">{sound.name}</p>
					<span className="text-muted-foreground block truncate text-xs">
						{sound.username} · {sound.license}
					</span>
				</div>
			</button>
			<Button variant="text" size="icon" onClick={handleSaveClick} aria-label={t(isSaved ? "Remove from saved" : "Save sound")}><HugeiconsIcon icon={FavouriteIcon} className={isSaved ? "fill-current text-red-500" : ""} /></Button>
		</div>
		<div className="mt-3 flex flex-wrap gap-2">
			<Button variant="outline" size="sm" disabled={!!busy || !(sound.downloadUrl || sound.previewUrl)} onClick={handleAddToTimeline}>
				{busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <HugeiconsIcon icon={PlusSignIcon} className="size-4" />}{t(busy === "add" ? "Adding sound..." : "Add to timeline")}
			</Button>
			<Button variant="outline" size="sm" disabled={!!busy || !(sound.downloadUrl || sound.previewUrl)} onClick={async () => {
				if (busyRef.current) return;
				busyRef.current = true; setBusy("download"); setFailure(null);
				try { const file = await fetchSoundFile(sound); downloadBlob({ blob: file, filename: file.name }); }
				catch (error) { const message = t(error instanceof Error ? error.message : "Sound download failed"); setFailure(message); toast.error(message); }
				finally { busyRef.current = false; setBusy(null); }
			}}>{busy === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{t(busy === "download" ? "Downloading sound..." : "Download sound")}</Button>
			{sound.url && <a className="self-center text-xs text-primary underline" href={sound.url} target="_blank" rel="noreferrer">{t("Source & license")}</a>}
		</div>
		{failure && <p role="alert" className="mt-2 text-xs text-destructive">{failure}</p>}
		</div>
	);
}
