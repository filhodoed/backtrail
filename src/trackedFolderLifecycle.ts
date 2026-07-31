import { basename } from 'node:path';
import * as vscode from 'vscode';
import { ChangesProvider } from './changesProvider';
import { markFileAsSeen, type BacktrailDecorationProvider } from './decorationProvider';
import {
	getCaptureDebounceSeconds,
	getIgnoreConfigForFolder,
	getMaxVersionsPerSeries,
	getRetentionDays,
} from './config';
import { captureBaselineSnapshots, watchTrackedFolder, type WarningHandler } from './fileWatcher';
import { BacktrailHistoryProvider } from './historyTreeProvider';
import { MonitorProvider } from './monitorProvider';
import { bucketIdFor, deleteBucket, hardenBucketPermissions, pruneOlderThan } from './snapshotStore';
import { forgetBucketId, getBucketId, recordBucketId, untrackFolder } from './trackedFolders';
import { TrackedFoldersProvider } from './trackedFoldersProvider';

export interface TrackedFolderLifecycleDeps {
	// vscode.Memento, not the narrower KeyValueStore — getIgnoreConfigForFolder
	// (config.ts) requires the real Memento type. Memento already satisfies
	// KeyValueStore structurally, so this works for every other call site too.
	globalState: vscode.Memento;
	storeRoot: string;
	historyProvider: BacktrailHistoryProvider;
	decorationProvider: BacktrailDecorationProvider;
	trackedFoldersProvider: TrackedFoldersProvider;
	changesProvider: ChangesProvider;
	monitorProvider: MonitorProvider;
	logWarning: WarningHandler;
}

export interface TrackedFolderLifecycle {
	startWatching(folder: string): void;
	stopWatching(folder: string): void;
	onFolderTracked(folder: string): void;
	onFolderUntracked(folder: string): void;
	untrackAndForget(folder: string): Promise<void>;
	onExclusionChanged(folder: string): void;
	dispose(): void;
}

// Owns the watcher-per-tracked-folder lifecycle (start/stop/track/untrack) —
// previously six closures (startWatching, stopWatching, onFolderTracked,
// onFolderUntracked, untrackAndForget, onExclusionChanged) living inside the
// body of extension.ts's activate(), sharing its `watchers` map. Same bodies,
// same call order — this only changes where the code lives, not what it does
// (see IR_008 in docs/MOF.md: watcher must start before baseline, tracking
// must persist before updateWorkspaceFolders, cancelling the baseline must
// undo the whole track).
export function createTrackedFolderLifecycle(deps: TrackedFolderLifecycleDeps): TrackedFolderLifecycle {
	const {
		globalState,
		storeRoot,
		historyProvider,
		decorationProvider,
		trackedFoldersProvider,
		changesProvider,
		monitorProvider,
		logWarning,
	} = deps;

	const watchers = new Map<string, vscode.Disposable>();

	function startWatching(folder: string): void {
		if (watchers.has(folder)) {
			return;
		}
		try {
			hardenBucketPermissions(storeRoot, folder);
			pruneOlderThan(storeRoot, folder, getRetentionDays(), new Date(), getMaxVersionsPerSeries());
			watchers.set(
				folder,
				watchTrackedFolder(
					folder,
					storeRoot,
					getIgnoreConfigForFolder(globalState, folder),
					(uri) => {
						historyProvider.notifyChange(uri);
						decorationProvider.refresh(uri);
						changesProvider.refresh();
						if (vscode.window.activeTextEditor?.document.uri.fsPath === uri.fsPath) {
							void markFileAsSeen(globalState, storeRoot, uri, decorationProvider)
								.then(() => changesProvider.refresh())
								.catch(() => {
									// Same fire-and-forget rationale as extension.ts's
									// handleActiveEditorChange — an unreachable tracked
									// folder shouldn't surface as an unhandled rejection.
								});
						}
					},
					getCaptureDebounceSeconds(),
					logWarning,
				),
			);
		} catch (error) {
			// A tracked folder that's gone (moved, deleted, unmounted drive)
			// must not abort activation — every other folder, and command
			// registration itself, still needs to happen.
			logWarning('startWatching', error, { folder });
		}
	}

	function stopWatching(folder: string): void {
		watchers.get(folder)?.dispose();
		watchers.delete(folder);
	}

	async function untrackAndForget(folder: string): Promise<void> {
		stopWatching(folder);
		// Cancelling the baseline scan means "undo tracking this folder
		// entirely" — unlike the manual Stop Tracking command, there's no
		// history worth confirming about yet (the baseline that would have
		// seeded it never finished), so the bucket is deleted unconditionally.
		// fallbackBucketId covers the folder-vanished-mid-scan case, using the
		// id recorded when tracking started (see onFolderTracked below).
		deleteBucket(storeRoot, folder, getBucketId(globalState, folder));
		await forgetBucketId(globalState, folder);
		await untrackFolder(globalState, folder);
		const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
		const index = workspaceFolders.findIndex((workspaceFolder) => workspaceFolder.uri.fsPath === folder);
		if (index !== -1) {
			vscode.workspace.updateWorkspaceFolders(index, 1);
		}
		trackedFoldersProvider.refresh();
		monitorProvider.refresh();
	}

	function onFolderTracked(folder: string): void {
		// Persist the bucketId now, while the folder is known to exist (it
		// was just picked/typed and validated) — this is the only fallback
		// deleteBucket has for a folder that's gone by the time it's
		// untracked (see untrackAndForget above and untrackFolderCommand).
		try {
			void recordBucketId(globalState, folder, bucketIdFor(folder));
		} catch (error) {
			logWarning('onFolderTracked (recordBucketId)', error, { folder });
		}

		// The watcher starts immediately rather than waiting on the baseline
		// scan below — a large folder's baseline can take a while now that
		// it no longer blocks the extension host, and real edits made while
		// it's still running shouldn't be missed. captureSnapshotsBatch's own
		// active-series check keeps the two from racing incorrectly.
		startWatching(folder);
		trackedFoldersProvider.refresh();
		changesProvider.refresh();
		monitorProvider.refresh();

		const cancellation = new vscode.CancellationTokenSource();

		const scan = (async () => {
			try {
				await captureBaselineSnapshots(
					folder,
					storeRoot,
					getIgnoreConfigForFolder(globalState, folder),
					cancellation.token,
				);
			} catch {
				// A folder that vanished mid-scan (moved, deleted) shouldn't
				// surface as an error — watching already started above.
			}
		})();

		// The Notification toast carries the only Cancel button the Progress
		// API offers — cancelling mid-scan almost always means "I tracked
		// the wrong folder," so Cancel here undoes the whole tracking, not
		// just the baseline walk, instead of leaving it half-tracked with no
		// history and no obvious way back.
		void vscode.window
			.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `backtrail: capturing baseline for "${basename(folder)}"… (cancel to stop tracking this folder)`,
					cancellable: true,
				},
				(_progress, token) => {
					token.onCancellationRequested(() => cancellation.cancel());
					return scan;
				},
			)
			.then(async () => {
				if (cancellation.token.isCancellationRequested) {
					await untrackAndForget(folder);
				}
				changesProvider.refresh();
				cancellation.dispose();
			});

		// A second, title-less indicator scoped to the Changes view itself —
		// the Notification toast above is easy to miss or auto-dismiss, and
		// losing any in-panel sign of activity here read as "broken," not
		// "still working," the first time a large folder was tracked.
		void vscode.window.withProgress({ location: { viewId: 'backtrail.changes' } }, () => scan);
	}

	function onFolderUntracked(folder: string): void {
		stopWatching(folder);
		trackedFoldersProvider.refresh();
		changesProvider.refresh();
		monitorProvider.refresh();
	}

	// A path excluded via the Monitor checkbox or the Changes context menu must
	// stop being captured going forward, not just get purged retroactively —
	// but ignoreConfig is only read once, at watcher creation (same limitation
	// already noted for vscode settings — see IR_007 in docs/MOF.md). Restarting
	// just this folder's watcher is the narrow fix: it picks up the freshly
	// persisted exclusion without requiring a full window reload.
	function onExclusionChanged(folder: string): void {
		stopWatching(folder);
		startWatching(folder);
		monitorProvider.refresh();
		changesProvider.refresh();
	}

	function dispose(): void {
		for (const watcher of watchers.values()) {
			watcher.dispose();
		}
		watchers.clear();
	}

	return {
		startWatching,
		stopWatching,
		onFolderTracked,
		onFolderUntracked,
		untrackAndForget,
		onExclusionChanged,
		dispose,
	};
}
