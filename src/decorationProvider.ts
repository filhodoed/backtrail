import * as vscode from 'vscode';
import { getDecorationState, markSeen } from './seenVersions';
import { findActiveSeriesId, listVersions } from './snapshotStore';
import { listTrackedFolders, resolveTrackedFolder, type KeyValueStore } from './trackedFolders';

export interface BacktrailDecorationProvider extends vscode.FileDecorationProvider {
	refresh(uri: vscode.Uri): void;
}

export function createDecorationProvider(globalState: KeyValueStore, storeRoot: string): BacktrailDecorationProvider {
	const emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

	return {
		onDidChangeFileDecorations: emitter.event,

		refresh(uri: vscode.Uri): void {
			emitter.fire(uri);
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

			const state = getDecorationState(globalState, seriesId, latest.timestamp);
			if (state === 'new') {
				return { badge: 'N', tooltip: 'backtrail: new file', propagate: true };
			}
			if (state === 'changed') {
				return { badge: 'M', tooltip: 'backtrail: changed since you last viewed it', propagate: true };
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
