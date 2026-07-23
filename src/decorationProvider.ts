import * as vscode from 'vscode';
import { getDecorationState, markSeen } from './seenVersions';
import { findActiveSeriesId, listActiveFiles, listVersions } from './snapshotStore';
import { listTrackedFolders, resolveTrackedFolder, type KeyValueStore } from './trackedFolders';

export interface BacktrailDecorationProvider extends vscode.FileDecorationProvider {
	refresh(uri: vscode.Uri): void;
	refreshAll(): void;
}

export function createDecorationProvider(globalState: KeyValueStore, storeRoot: string): BacktrailDecorationProvider {
	const emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

	return {
		onDidChangeFileDecorations: emitter.event,

		refresh(uri: vscode.Uri): void {
			emitter.fire(uri);
		},

		refreshAll(): void {
			emitter.fire(undefined);
		},

		provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
			const folders = listTrackedFolders(globalState);
			const match = resolveTrackedFolder(folders, uri.fsPath);
			if (!match) {
				return undefined;
			}

			const seriesId = findActiveSeriesId(storeRoot, match.folder, match.relPath);
			if (!seriesId) {
				return undefined;
			}

			const versions = listVersions(storeRoot, match.folder, seriesId);
			const latest = versions[versions.length - 1];
			if (!latest) {
				return undefined;
			}

			const color = new vscode.ThemeColor('gitDecoration.addedResourceForeground');
			const state = getDecorationState(globalState, seriesId, latest.timestamp);
			if (state === 'new') {
				return { badge: 'N', tooltip: 'backtrail: new file', color, propagate: true };
			}
			if (state === 'changed') {
				return { badge: 'M', tooltip: 'backtrail: changed since you last viewed it', color, propagate: true };
			}
			return undefined;
		},
	};
}

export async function markFileAsSeen(
	globalState: KeyValueStore,
	storeRoot: string,
	uri: vscode.Uri,
	decorationProvider: BacktrailDecorationProvider,
): Promise<void> {
	const folders = listTrackedFolders(globalState);
	const match = resolveTrackedFolder(folders, uri.fsPath);
	if (!match) {
		return;
	}

	const seriesId = findActiveSeriesId(storeRoot, match.folder, match.relPath);
	if (!seriesId) {
		return;
	}

	const versions = listVersions(storeRoot, match.folder, seriesId);
	const latest = versions[versions.length - 1];
	if (!latest) {
		return;
	}

	await markSeen(globalState, seriesId, latest.timestamp);
	decorationProvider.refresh(uri);
}

// Backing a folder marks every file already in it as "new" the moment it's
// tracked (see captureBaselineSnapshots) — useful as a diff baseline, but it
// floods the Changes list on day one. This lets a user clear that noise in
// one action instead of opening every file by hand.
export async function markFolderAsSeen(
	globalState: KeyValueStore,
	storeRoot: string,
	folder: string,
	decorationProvider: BacktrailDecorationProvider,
): Promise<void> {
	for (const file of listActiveFiles(storeRoot, folder)) {
		await markSeen(globalState, file.seriesId, file.lastVersion.timestamp);
	}
	decorationProvider.refreshAll();
}
