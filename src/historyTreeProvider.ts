import * as vscode from 'vscode';
import { SHOW_DIFF_COMMAND, SHOW_VERSION_INFO_COMMAND } from './diffCommand';
import { canShowDiff } from './diffEligibility';
import { formatBytes } from './format';
import { findActiveSeriesId, listVersions, type SnapshotVersion } from './snapshotStore';
import { listTrackedFolders, resolveTrackedFolder } from './trackedFolders';

export interface VersionTreeItem {
	version: SnapshotVersion;
	previousVersion?: SnapshotVersion;
	folder: string;
	index: number;
}

export class BacktrailHistoryProvider implements vscode.TreeDataProvider<VersionTreeItem> {
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;

	private activeUri: vscode.Uri | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly storeRoot: string,
	) {}

	setActiveUri(uri: vscode.Uri | undefined): void {
		this.activeUri = uri;
		this.emitter.fire();
	}

	notifyChange(uri: vscode.Uri): void {
		if (this.activeUri && this.activeUri.fsPath === uri.fsPath) {
			this.emitter.fire();
		}
	}

	getTreeItem(element: VersionTreeItem): vscode.TreeItem {
		const item = new vscode.TreeItem(new Date(element.version.timestamp).toLocaleString());
		item.description = formatBytes(element.version.sizeBytes);
		item.contextValue = element.version.isBinary ? 'backtrailBinaryVersion' : 'backtrailTextVersion';
		item.id = `${element.folder}:${element.version.relPath}:${element.index}`;

		if (canShowDiff(element.version)) {
			if (element.previousVersion) {
				item.command = {
					command: SHOW_DIFF_COMMAND,
					title: 'Show Diff',
					arguments: [element.folder, element.previousVersion, element.version],
				};
			}
		} else {
			item.command = {
				command: SHOW_VERSION_INFO_COMMAND,
				title: 'Show Info',
				arguments: [element.version],
			};
		}

		return item;
	}

	getChildren(element?: VersionTreeItem): VersionTreeItem[] {
		if (element || !this.activeUri) {
			return [];
		}

		const folders = listTrackedFolders(this.context.globalState);
		const match = resolveTrackedFolder(folders, this.activeUri.fsPath);
		if (!match) {
			return [];
		}

		const seriesId = findActiveSeriesId(this.storeRoot, match.folder, match.relPath);
		if (!seriesId) {
			return [];
		}

		const versions = listVersions(this.storeRoot, match.folder, seriesId);
		const items: VersionTreeItem[] = versions.map((version, index) => ({
			version,
			previousVersion: index > 0 ? versions[index - 1] : undefined,
			folder: match.folder,
			index,
		}));
		return items.reverse();
	}
}
