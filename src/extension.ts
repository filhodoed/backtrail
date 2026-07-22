import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { getIgnoreConfig, getRetentionDays } from './config';
import { createDecorationProvider, markFileAsSeen, type BacktrailDecorationProvider } from './decorationProvider';
import { registerDiffCommand } from './diffCommand';
import { watchTrackedFolder } from './fileWatcher';
import { BacktrailHistoryProvider } from './historyTreeProvider';
import { registerRestoreCommand } from './restoreCommand';
import { pruneOlderThan } from './snapshotStore';
import { registerTrackedFoldersCommands } from './trackedFoldersCommands';
import { TrackedFoldersProvider } from './trackedFoldersProvider';
import { listTrackedFolders } from './trackedFolders';

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
}

export function activate(context: vscode.ExtensionContext): BacktrailApi {
	const storeRoot = context.globalStorageUri.fsPath;

	const historyProvider = new BacktrailHistoryProvider(context, storeRoot);
	context.subscriptions.push(vscode.window.createTreeView('backtrail.history', { treeDataProvider: historyProvider }));

	const decorationProvider = createDecorationProvider(context.globalState, storeRoot);
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

	const trackedFoldersProvider = new TrackedFoldersProvider(context);
	context.subscriptions.push(
		vscode.window.createTreeView('backtrail.trackedFolders', { treeDataProvider: trackedFoldersProvider }),
	);

	registerDiffCommand(context, storeRoot);
	registerRestoreCommand(context, storeRoot);

	async function handleActiveEditorChange(editor: vscode.TextEditor | undefined): Promise<void> {
		const uri = editor?.document.uri;
		historyProvider.setActiveUri(uri);
		if (uri) {
			try {
				await markFileAsSeen(context.globalState, storeRoot, uri, decorationProvider);
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

	function onFolderTracked(folder: string): void {
		startWatching(folder);
		trackedFoldersProvider.refresh();
	}

	function onFolderUntracked(folder: string): void {
		stopWatching(folder);
		trackedFoldersProvider.refresh();
	}

	for (const folder of listTrackedFolders(context.globalState)) {
		startWatching(folder);
	}

	registerCommands(context, onFolderTracked);
	registerTrackedFoldersCommands(context, onFolderTracked, onFolderUntracked);

	context.subscriptions.push(
		new vscode.Disposable(() => {
			for (const watcher of watchers.values()) {
				watcher.dispose();
			}
			watchers.clear();
		}),
	);

	return { globalState: context.globalState, storeRoot, historyProvider, decorationProvider, trackedFoldersProvider };
}

export function deactivate() {}
