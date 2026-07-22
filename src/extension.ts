import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerDiffCommand } from './diffCommand';
import { watchTrackedFolder } from './fileWatcher';
import { BacktrailHistoryProvider } from './historyTreeProvider';
import { registerRestoreCommand } from './restoreCommand';
import { listTrackedFolders } from './trackedFolders';

export interface BacktrailApi {
	globalState: vscode.Memento;
	storeRoot: string;
	historyProvider: BacktrailHistoryProvider;
}

export function activate(context: vscode.ExtensionContext): BacktrailApi {
	const storeRoot = context.globalStorageUri.fsPath;
	const historyProvider = new BacktrailHistoryProvider(context, storeRoot);
	context.subscriptions.push(vscode.window.createTreeView('backtrail.history', { treeDataProvider: historyProvider }));
	registerDiffCommand(context, storeRoot);
	registerRestoreCommand(context, storeRoot);

	historyProvider.setActiveUri(vscode.window.activeTextEditor?.document.uri);
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => historyProvider.setActiveUri(editor?.document.uri)),
	);

	const watchers = new Map<string, vscode.Disposable>();

	function startWatching(folder: string): void {
		if (watchers.has(folder)) {
			return;
		}
		watchers.set(
			folder,
			watchTrackedFolder(folder, storeRoot, undefined, (uri) => historyProvider.notifyChange(uri)),
		);
	}

	for (const folder of listTrackedFolders(context.globalState)) {
		startWatching(folder);
	}

	registerCommands(context, startWatching);

	context.subscriptions.push(
		new vscode.Disposable(() => {
			for (const watcher of watchers.values()) {
				watcher.dispose();
			}
			watchers.clear();
		}),
	);

	return { globalState: context.globalState, storeRoot, historyProvider };
}

export function deactivate() {}
