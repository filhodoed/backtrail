import { basename } from 'node:path';
import * as vscode from 'vscode';
import { ChangesProvider } from './changesProvider';
import { registerOpenChangedFileCommand, registerStopTrackingPathCommand } from './changesCommands';
import { registerCommands } from './commands';
import {
	getCaptureDebounceSeconds,
	getIgnoreConfigForFolder,
	getMaxVersionsPerSeries,
	getRetentionDays,
} from './config';
import { createDecorationProvider, markFileAsSeen, type BacktrailDecorationProvider } from './decorationProvider';
import { registerDiffCommand } from './diffCommand';
import { captureBaselineSnapshots, watchTrackedFolder } from './fileWatcher';
import { BacktrailHistoryProvider } from './historyTreeProvider';
import { registerMonitorCheckboxHandler } from './monitorCommands';
import { MonitorProvider, type MonitorNode } from './monitorProvider';
import { logCaptureWarning } from './outputChannel';
import { registerRestoreCommand } from './restoreCommand';
import { bucketIdFor, deleteBucket, hardenBucketPermissions, pruneOlderThan } from './snapshotStore';
import { registerTrackedFoldersCommands } from './trackedFoldersCommands';
import { TrackedFoldersProvider } from './trackedFoldersProvider';
import { forgetBucketId, getBucketId, listTrackedFolders, recordBucketId, untrackFolder } from './trackedFolders';

export const PRUNE_NOW_COMMAND = 'backtrail.pruneNow';

// A VS Code window can stay open for weeks — pruning only on activation
// means retention is effectively unbounded for a long-lived session. This
// interval is deliberately coarse (once a day is plenty for a days-based
// retention setting) and runs alongside the manual "Backtrail: Prune Now"
// command below for anyone who doesn't want to wait.
const PERIODIC_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface BacktrailApi {
	globalState: vscode.Memento;
	storeRoot: string;
	historyProvider: BacktrailHistoryProvider;
	decorationProvider: BacktrailDecorationProvider;
	trackedFoldersProvider: TrackedFoldersProvider;
	changesProvider: ChangesProvider;
	monitorProvider: MonitorProvider;
}

export function activate(context: vscode.ExtensionContext): BacktrailApi {
	const storeRoot = context.globalStorageUri.fsPath;

	const outputChannel = vscode.window.createOutputChannel('Backtrail');
	context.subscriptions.push(outputChannel);
	const logWarning = (warningContext: string, error: unknown, metadata?: Record<string, string>) =>
		logCaptureWarning(outputChannel, warningContext, error, metadata);

	const historyProvider = new BacktrailHistoryProvider(context, storeRoot);
	context.subscriptions.push(vscode.window.createTreeView('backtrail.history', { treeDataProvider: historyProvider }));

	const decorationProvider = createDecorationProvider(context.globalState, storeRoot);
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

	// Two separate views in the same activity-bar container, stacked and
	// independently resizable — the same layout git's own Source Control
	// panel uses for "Changes"/"Staged Changes", rather than one tree with
	// nested section nodes under a single chevron.
	const trackedFoldersProvider = new TrackedFoldersProvider(context);
	context.subscriptions.push(
		vscode.window.createTreeView('backtrail.trackedFolders', { treeDataProvider: trackedFoldersProvider }),
	);

	const changesProvider = new ChangesProvider(context, storeRoot);
	context.subscriptions.push(vscode.window.createTreeView('backtrail.changes', { treeDataProvider: changesProvider }));

	const monitorProvider = new MonitorProvider(context);
	const monitorTreeView = vscode.window.createTreeView<MonitorNode>('backtrail.monitor', {
		treeDataProvider: monitorProvider,
		// Without this, VS Code's own checkbox cascade unchecks the parent
		// whenever a single child is unchecked (documented behavior, see
		// TreeViewOptions.manageCheckboxStateManually example 4) — turning a
		// ".DS_Store" exclusion into excluding its whole parent directory.
		// getTreeItem already derives every node's checkbox state from
		// excludedPaths, so VS Code's own cascade is redundant anyway.
		manageCheckboxStateManually: true,
	});
	context.subscriptions.push(monitorTreeView);

	registerDiffCommand(context, storeRoot);
	registerRestoreCommand(context, storeRoot);
	registerOpenChangedFileCommand(context, decorationProvider, changesProvider);

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

	registerMonitorCheckboxHandler(context, monitorTreeView, storeRoot, onExclusionChanged);
	registerStopTrackingPathCommand(context, storeRoot, onExclusionChanged);

	async function handleActiveEditorChange(editor: vscode.TextEditor | undefined): Promise<void> {
		const uri = editor?.document.uri;
		historyProvider.setActiveUri(uri);
		if (uri) {
			try {
				await markFileAsSeen(context.globalState, storeRoot, uri, decorationProvider);
				changesProvider.refresh();
			} catch {
				// Fire-and-forget from onDidChangeActiveTextEditor — an unreachable
				// tracked folder shouldn't surface as an unhandled rejection.
			}
		}
	}

	void handleActiveEditorChange(vscode.window.activeTextEditor);
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(handleActiveEditorChange));

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
					getIgnoreConfigForFolder(context.globalState, folder),
					(uri) => {
						historyProvider.notifyChange(uri);
						decorationProvider.refresh(uri);
						changesProvider.refresh();
						if (vscode.window.activeTextEditor?.document.uri.fsPath === uri.fsPath) {
							void markFileAsSeen(context.globalState, storeRoot, uri, decorationProvider)
								.then(() => changesProvider.refresh())
								.catch(() => {
									// Same fire-and-forget rationale as handleActiveEditorChange above.
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
			// registration itself, still needs to happen below.
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
		deleteBucket(storeRoot, folder, getBucketId(context.globalState, folder));
		await forgetBucketId(context.globalState, folder);
		await untrackFolder(context.globalState, folder);
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
			void recordBucketId(context.globalState, folder, bucketIdFor(folder));
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
					getIgnoreConfigForFolder(context.globalState, folder),
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

	for (const folder of listTrackedFolders(context.globalState)) {
		startWatching(folder);
	}

	registerCommands(context, onFolderTracked);
	registerTrackedFoldersCommands(context, storeRoot, decorationProvider, onFolderTracked, onFolderUntracked, () =>
		changesProvider.refresh(),
	);

	function pruneAllTrackedFolders(): number {
		const retentionDays = getRetentionDays();
		const maxVersionsPerSeries = getMaxVersionsPerSeries();
		let prunedCount = 0;
		for (const folder of listTrackedFolders(context.globalState)) {
			try {
				prunedCount += pruneOlderThan(storeRoot, folder, retentionDays, new Date(), maxVersionsPerSeries);
			} catch {
				// Same tolerance as startWatching: a folder that's gone shouldn't
				// stop the sweep for every other tracked folder.
			}
		}
		return prunedCount;
	}

	const periodicPrune = setInterval(pruneAllTrackedFolders, PERIODIC_PRUNE_INTERVAL_MS);

	context.subscriptions.push(
		vscode.commands.registerCommand(PRUNE_NOW_COMMAND, () => {
			const prunedCount = pruneAllTrackedFolders();
			changesProvider.refresh();
			void vscode.window.showInformationMessage(
				prunedCount === 0
					? 'backtrail: nothing to prune — no snapshots older than the retention window.'
					: `backtrail: pruned ${prunedCount} snapshot${prunedCount === 1 ? '' : 's'} older than the retention window.`,
			);
		}),
		new vscode.Disposable(() => clearInterval(periodicPrune)),
		new vscode.Disposable(() => {
			for (const watcher of watchers.values()) {
				watcher.dispose();
			}
			watchers.clear();
		}),
	);

	return {
		globalState: context.globalState,
		storeRoot,
		historyProvider,
		decorationProvider,
		trackedFoldersProvider,
		changesProvider,
		monitorProvider,
	};
}

export function deactivate() {}
