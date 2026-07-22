import { basename } from 'node:path';
import * as vscode from 'vscode';
import { listTrackedFolders } from './trackedFolders';

export class TrackedFoldersProvider implements vscode.TreeDataProvider<string> {
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;

	constructor(private readonly context: vscode.ExtensionContext) {}

	refresh(): void {
		this.emitter.fire();
	}

	getTreeItem(folder: string): vscode.TreeItem {
		const item = new vscode.TreeItem(basename(folder));
		item.description = folder;
		item.contextValue = 'backtrailTrackedFolder';
		item.resourceUri = vscode.Uri.file(folder);
		item.iconPath = vscode.ThemeIcon.Folder;
		return item;
	}

	getChildren(element?: string): string[] {
		if (element) {
			return [];
		}
		return listTrackedFolders(this.context.globalState);
	}
}
