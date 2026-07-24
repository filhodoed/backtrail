import { basename } from 'node:path';
import * as vscode from 'vscode';
import { ChangesProvider } from './changesProvider';
import { registerOpenChangedFileCommand } from './changesCommands';
import { registerCommands } from './commands';
import { getIgnoreConfig, getRetentionDays } from './config';
import { createDecorationProvider, markFileAsSeen, type BacktrailDecorationProvider } from './decorationProvider';
import { registerDiffCommand } from './diffCommand';
import { captureBaselineSnapshots, watchTrackedFolder } from './fileWatcher';
import { BacktrailHistoryProvider } from './historyTreeProvider';
import { registerRestoreCommand } from './restoreCommand';
import { pruneOlderThan } from './snapshotStore';
import { registerTrackedFoldersCommands } from './trackedFoldersCommands';
import { TrackedFoldersProvider } from './trackedFoldersProvider';
import { listTrackedFolders, untrackFolder } from './trackedFolders';

// ponytail: prunes once per activation only, not on a periodic timer — fine
// for a session that restarts daily, but a VS Code window left open for
// weeks won't see the retention window enforced until reactivated. Add a
// setInterval sweep if that turns out to matter in practice.

export interface BacktrailApi {
	globalState: vscode.Memento;
	storeRoot: string;
	historyProvider: BacktrailHistoryProvider;
	decorationProvider: BacktrailDecorationProvider;
	trackedFoldersProvider: TrackedFoldersProvider;
	changesProvider: ChangesProvider;
}

export function activate(context: vscode.ExtensionContext): BacktrailApi {
	const storeRoot = context.globalStorageUri.fsPath;

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

	registerDiffCommand(context, storeRoot);
	registerRestoreCommand(context, storeRoot);
	registerOpenChangedFileCommand(context, decorationProvider, changesProvider);

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
			pruneOlderThan(storeRoot, folder, getRetentionDays());
			watchers.set(
				folder,
				watchTrackedFolder(folder, storeRoot, getIgnoreConfig(), (uri) => {
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
				}),
			);
		} catch {
			// A tracked folder that's gone (moved, deleted, unmounted drive)
			// must not abort activation — every other folder, and command
			// registration itself, still needs to happen below.
		}
	}

	function stopWatching(folder: string): void {
		watchers.get(folder)?.dispose();
		watchers.delete(folder);
	}

	async function untrackAndForget(folder: string): Promise<void> {
		stopWatching(folder);
		await untrackFolder(context.globalState, folder);
		const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
		const index = workspaceFolders.findIndex((workspaceFolder) => workspaceFolder.uri.fsPath === folder);
		if (index !== -1) {
			vscode.workspace.updateWorkspaceFolders(index, 1);
		}
		trackedFoldersProvider.refresh();
	}

	function onFolderTracked(folder: string): void {
		// The watcher starts immediately rather than waiting on the baseline
		// scan below — a large folder's baseline can take a while now that
		// it no longer blocks the extension host, and real edits made while
		// it's still running shouldn't be missed. captureSnapshotsBatch's own
		// active-series check keeps the two from racing incorrectly.
		startWatching(folder);
		trackedFoldersProvider.refresh();
		changesProvider.refresh();

		const cancellation = new vscode.CancellationTokenSource();

		const scan = (async () => {
			try {
				await captureBaselineSnapshots(folder, storeRoot, getIgnoreConfig(), cancellation.token);
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
	}

	for (const folder of listTrackedFolders(context.globalState)) {
		startWatching(folder);
	}

	registerCommands(context, onFolderTracked);
	registerTrackedFoldersCommands(context, storeRoot, decorationProvider, onFolderTracked, onFolderUntracked, () =>
		changesProvider.refresh(),
	);

	context.subscriptions.push(
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
	};
}

export function deactivate() {}
