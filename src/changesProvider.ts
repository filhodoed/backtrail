import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { OPEN_CHANGED_FILE_COMMAND } from './changesCommands';
import { canShowDiff } from './diffEligibility';
import { getDecorationState, type DecorationState } from './seenVersions';
import { listActiveFiles, listVersions } from './snapshotStore';
import { listTrackedFolders } from './trackedFolders';

type ChangeState = Exclude<DecorationState, 'none'>;

export type ChangeNode =
	| { kind: 'group'; state: ChangeState; count: number }
	| { kind: 'file'; folder: string; relPath: string; state: ChangeState; seriesId: string };

const GROUP_LABEL: Record<ChangeState, string> = {
	changed: 'Modified',
	new: 'New',
};

interface ActiveChange {
	folder: string;
	relPath: string;
	seriesId: string;
	state: ChangeState;
}

export class ChangesProvider implements vscode.TreeDataProvider<ChangeNode> {
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly storeRoot: string,
	) {}

	refresh(): void {
		this.emitter.fire();
	}

	private collectChanges(): ActiveChange[] {
		const changes: ActiveChange[] = [];
		for (const folder of listTrackedFolders(this.context.globalState)) {
			// A tracked folder that's gone (moved, deleted, unmounted drive) must
			// not break the whole Changes list for every other folder — same
			// tolerance startWatching already gives this exact situation.
			let activeFiles: ReturnType<typeof listActiveFiles>;
			try {
				activeFiles = listActiveFiles(this.storeRoot, folder);
			} catch {
				continue;
			}
			for (const file of activeFiles) {
				const state = getDecorationState(this.context.globalState, file.seriesId, file.lastVersion.timestamp);
				if (state !== 'none') {
					changes.push({ folder, relPath: file.relPath, seriesId: file.seriesId, state });
				}
			}
		}
		return changes;
	}

	getTreeItem(element: ChangeNode): vscode.TreeItem {
		if (element.kind === 'group') {
			const item = new vscode.TreeItem(GROUP_LABEL[element.state], vscode.TreeItemCollapsibleState.Expanded);
			item.description = String(element.count);
			item.contextValue = 'backtrailChangeGroup';
			item.iconPath = new vscode.ThemeIcon(element.state === 'new' ? 'diff-added' : 'diff-modified');
			return item;
		}

		const item = new vscode.TreeItem(basename(element.relPath));
		const dir = dirname(element.relPath);
		item.description = dir === '.' ? undefined : dir;
		item.contextValue = 'backtrailChangedFile';
		item.resourceUri = vscode.Uri.file(join(element.folder, element.relPath));

		const versions = listVersions(this.storeRoot, element.folder, element.seriesId);
		const latest = versions[versions.length - 1];
		const previous = versions.length > 1 ? versions[versions.length - 2] : undefined;
		if (latest) {
			item.command = {
				command: OPEN_CHANGED_FILE_COMMAND,
				title: 'Open Change',
				arguments: [element.folder, element.seriesId, previous, latest, canShowDiff(latest)],
			};
		}

		return item;
	}

	getChildren(element?: ChangeNode): ChangeNode[] {
		if (!element) {
			const changes = this.collectChanges();
			// Mirrors git's Source Control layout: modified files surface above
			// untracked/new ones, and a state with nothing in it doesn't get an
			// empty group.
			const groups: ChangeNode[] = [];
			const changedCount = changes.filter((c) => c.state === 'changed').length;
			const newCount = changes.filter((c) => c.state === 'new').length;
			if (changedCount > 0) {
				groups.push({ kind: 'group', state: 'changed', count: changedCount });
			}
			if (newCount > 0) {
				groups.push({ kind: 'group', state: 'new', count: newCount });
			}
			return groups;
		}

		if (element.kind === 'group') {
			return this.collectChanges()
				.filter((change) => change.state === element.state)
				.map((change) => ({
					kind: 'file' as const,
					folder: change.folder,
					relPath: change.relPath,
					state: change.state,
					seriesId: change.seriesId,
				}))
				.sort((a, b) => a.relPath.localeCompare(b.relPath));
		}

		return [];
	}
}
