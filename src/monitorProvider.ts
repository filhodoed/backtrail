import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { listExcludedPaths } from './excludedPaths';
import { pathHasPrefix } from './ignoreFilters';
import { listTrackedFolders } from './trackedFolders';

export interface MonitorNode {
	folder: string;
	// '' represents the tracked folder's own root row; every other value is a
	// path relative to it, same convention as SnapshotVersion.relPath.
	relPath: string;
}

// Deliberately shows the real filesystem with no name/extension filtering
// (unlike the watcher's shouldIgnore) — the whole point of this view is
// letting the user exclude a path shouldIgnore's name-based rules don't
// otherwise catch (tópico 7: "esse dir1/cache específico, sem afetar
// dir2/cache").
export class MonitorProvider implements vscode.TreeDataProvider<MonitorNode> {
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;

	constructor(private readonly context: vscode.ExtensionContext) {}

	refresh(): void {
		this.emitter.fire();
	}

	private absolutePathOf(node: MonitorNode): string {
		return node.relPath === '' ? node.folder : join(node.folder, node.relPath);
	}

	getTreeItem(node: MonitorNode): vscode.TreeItem {
		const isRoot = node.relPath === '';
		const absolutePath = this.absolutePathOf(node);

		let isDirectory = false;
		try {
			isDirectory = statSync(absolutePath).isDirectory();
		} catch {
			// Removed from disk after the tree was built — render as a leaf so
			// expanding it doesn't throw; it disappears on the next refresh.
		}

		const item = new vscode.TreeItem(
			isRoot ? node.folder : basename(node.relPath),
			isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
		);
		item.resourceUri = vscode.Uri.file(absolutePath);
		item.contextValue = isRoot ? 'backtrailMonitorRoot' : 'backtrailMonitorNode';

		// The root row stands for the whole tracked folder — excluding it is
		// what "Stop Tracking" already does, so it gets no checkbox of its own.
		if (!isRoot) {
			const excludedPrefixes = listExcludedPaths(this.context.globalState, node.folder);
			const isExcluded = excludedPrefixes.some((prefix) => pathHasPrefix(node.relPath, prefix));
			item.checkboxState = isExcluded ? vscode.TreeItemCheckboxState.Unchecked : vscode.TreeItemCheckboxState.Checked;
		}

		return item;
	}

	getChildren(node?: MonitorNode): MonitorNode[] {
		if (!node) {
			return listTrackedFolders(this.context.globalState).map((folder) => ({ folder, relPath: '' }));
		}

		let entries: string[];
		try {
			entries = readdirSync(this.absolutePathOf(node));
		} catch {
			return [];
		}

		return entries
			.map((name) => ({ folder: node.folder, relPath: node.relPath === '' ? name : join(node.relPath, name) }))
			.sort((a, b) => a.relPath.localeCompare(b.relPath));
	}
}
