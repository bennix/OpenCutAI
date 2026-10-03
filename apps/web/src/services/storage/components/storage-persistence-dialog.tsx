"use client";
import { UiText } from "@/i18n";


import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useStoragePersistence } from "@/services/storage/use-storage-persistence";

export function StoragePersistenceDialog() {
	const { showDialog, onConfirm, onDismiss } = useStoragePersistence();

	return (
		<Dialog open={showDialog} onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle><UiText text="Don't lose your projects" /></DialogTitle>
				</DialogHeader>
				<DialogBody>
					<p className="text-base text-muted-foreground">
						<UiText text="Your browser can automatically delete your projects when storage runs low." /></p>
					<p className="text-base text-muted-foreground">
						<UiText text="Allow OpenCut to protect them?" /></p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={onDismiss}>
						<UiText text="Not now" /></Button>
					<Button onClick={onConfirm}><UiText text="Allow" /></Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
