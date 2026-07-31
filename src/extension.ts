import * as vscode from 'vscode';
import { ChangesProvider } from './changesProvider';
import { registerOpenChangedFileCommand, registerStopTrackingPathCommand } from './changesCommands';
import { registerCommands } from './commands';
import { getMaxVersionsPerSeries, getRetentionDays } from './config';
import { createDecorationProvider, markFileAsSeen, type BacktrailDecorationProvider } from './decorationProvider';
import { registerDiffCommand } from './diffCommand';
import { BacktrailHistoryProvider } from './historyTreeProvider';
import { registerMonitorCheckboxHandler } from './monitorCommands';
import { MonitorProvider, type MonitorNode } from './monitorProvider';
import { logCaptureWarning } from './outputChannel';
import { registerRestoreCommand } from './restoreCommand';
import { pruneOlderThan } from './snapshotStore';
import { createTrackedFolderLifecycle } from './trackedFolderLifecycle';
import { registerTrackedFoldersCommands } from './trackedFoldersCommands';
import { TrackedFoldersProvider } from './trackedFoldersProvider';
import { listTrackedFolders } from './trackedFolders';

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

	const lifecycle = createTrackedFolderLifecycle({
		globalState: context.globalState,
		storeRoot,
		historyProvider,
		decorationProvider,
		trackedFoldersProvider,
		changesProvider,
		monitorProvider,
		logWarning,
	});

	registerMonitorCheckboxHandler(context, monitorTreeView, storeRoot, lifecycle.onExclusionChanged);
	registerStopTrackingPathCommand(context, storeRoot, lifecycle.onExclusionChanged);

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

	for (const folder of listTrackedFolders(context.globalState)) {
		lifecycle.startWatching(folder);
	}

	registerCommands(context, lifecycle.onFolderTracked);
	registerTrackedFoldersCommands(
		context,
		storeRoot,
		decorationProvider,
		lifecycle.onFolderTracked,
		lifecycle.onFolderUntracked,
		() => changesProvider.refresh(),
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
		new vscode.Disposable(() => lifecycle.dispose()),
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
