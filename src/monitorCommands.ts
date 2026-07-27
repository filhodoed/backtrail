import * as vscode from 'vscode';
import { includePath } from './excludedPaths';
import type { MonitorNode } from './monitorProvider';
import { stopTrackingPath } from './pathExclusion';

export function registerMonitorCheckboxHandler(
	context: vscode.ExtensionContext,
	treeView: vscode.TreeView<MonitorNode>,
	storeRoot: string,
	onExclusionChanged: (folder: string) => void,
): void {
	context.subscriptions.push(
		treeView.onDidChangeCheckboxState(async (event) => {
			for (const [node, state] of event.items) {
				if (state === vscode.TreeItemCheckboxState.Unchecked) {
					await stopTrackingPath(context.globalState, storeRoot, node.folder, node.relPath, () =>
						onExclusionChanged(node.folder),
					);
				} else {
					// Re-including is non-destructive (nothing to purge, no history
					// at stake) — unlike excluding, it needs no confirmation prompt.
					await includePath(context.globalState, node.folder, node.relPath);
					onExclusionChanged(node.folder);
				}
			}
		}),
	);
}
