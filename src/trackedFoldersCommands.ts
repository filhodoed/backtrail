import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import * as vscode from 'vscode';
import { markFolderAsSeen, type BacktrailDecorationProvider } from './decorationProvider';
import { isInsideGitRepo } from './gitGuard';
import { trackFolder, untrackFolder } from './trackedFolders';

export const ADD_FOLDER_COMMAND = 'backtrail.addFolder';
export const ADD_FOLDER_BY_PATH_COMMAND = 'backtrail.addFolderByPath';
export const UNTRACK_FOLDER_COMMAND = 'backtrail.untrackFolder';
export const MARK_FOLDER_SEEN_COMMAND = 'backtrail.markFolderSeen';

export function registerTrackedFoldersCommands(
	context: vscode.ExtensionContext,
	storeRoot: string,
	decorationProvider: BacktrailDecorationProvider,
	onFolderTracked: (folder: string) => void,
	onFolderUntracked: (folder: string) => void,
	onChangesReset: () => void,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(ADD_FOLDER_COMMAND, (folderUri?: vscode.Uri) =>
			addFolderCommand(context, onFolderTracked, folderUri),
		),
		vscode.commands.registerCommand(ADD_FOLDER_BY_PATH_COMMAND, () => addFolderByPathCommand(context, onFolderTracked)),
		vscode.commands.registerCommand(UNTRACK_FOLDER_COMMAND, (folder: string) =>
			untrackFolderCommand(context, folder, onFolderUntracked),
		),
		vscode.commands.registerCommand(MARK_FOLDER_SEEN_COMMAND, async (folder: string) => {
			await markFolderAsSeen(context.globalState, storeRoot, folder, decorationProvider);
			onChangesReset();
		}),
	);
}

async function addFolderCommand(
	context: vscode.ExtensionContext,
	onFolderTracked: (folder: string) => void,
	folderUri?: vscode.Uri,
): Promise<void> {
	try {
		if (!folderUri) {
			const picked = await vscode.window.showOpenDialog({
				canSelectFolders: true,
				canSelectFiles: false,
				canSelectMany: false,
				openLabel: 'Track Folder',
			});
			if (!picked || picked.length === 0) {
				return;
			}
			folderUri = picked[0];
		}

		const absolutePath = folderUri.fsPath;

		if (isInsideGitRepo(absolutePath)) {
			void vscode.window.showWarningMessage(
				`backtrail: "${basename(absolutePath)}" is inside a git repository and cannot be tracked.`,
			);
			return;
		}

		// Tracking someone's entire home folder is almost never what they
		// meant to pick — it drags in caches, every project's node_modules,
		// mail, photo libraries — and used to be the only way to reach a
		// hidden folder the OS picker wouldn't show (fixed by the by-path
		// command below), so confirm rather than silently accepting it.
		if (absolutePath === homedir()) {
			const proceedAction = 'Track Anyway';
			const choice = await vscode.window.showWarningMessage(
				'backtrail: this is your entire home folder. Tracking it captures a huge number of unrelated files and can take a long time. Track a more specific folder instead?',
				{ modal: true },
				proceedAction,
			);
			if (choice !== proceedAction) {
				return;
			}
		}

		// Tracking is persisted before touching the workspace on purpose: adding
		// the first folder to an empty window makes VS Code reload the
		// extension host to switch workspace identity, which can cut off
		// everything below this point. The folder stays tracked either way.
		await trackFolder(context.globalState, absolutePath);
		// Tracking already succeeded above — a hiccup refreshing the tree view
		// or starting the watcher shouldn't surface as "couldn't add that
		// folder" when the folder demonstrably was added.
		try {
			onFolderTracked(absolutePath);
		} catch {
			// See comment above.
		}

		// Always append — start index is the current folder count, delete count
		// is 0 — never replaces the existing workspace folders.
		const existing = vscode.workspace.workspaceFolders ?? [];
		const alreadyOpen = existing.some((folder) => folder.uri.fsPath === absolutePath);
		if (!alreadyOpen) {
			vscode.workspace.updateWorkspaceFolders(existing.length, 0, { uri: folderUri });
		}

		void vscode.window.showInformationMessage(`backtrail: now tracking "${basename(absolutePath)}".`);
	} catch (error) {
		void vscode.window.showErrorMessage(
			`backtrail: couldn't add that folder — ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function validateFolderPath(value: string): string | undefined {
	const path = value.trim();
	if (!path) {
		return 'Enter a folder path.';
	}
	if (!existsSync(path)) {
		return 'No folder exists at this path.';
	}
	if (!statSync(path).isDirectory()) {
		return 'This path is not a folder.';
	}
	return undefined;
}

// The OS folder picker (showOpenDialog) hides dotfiles/dotfolders by default
// on macOS and Linux, and the VS Code API exposes no option to change that —
// this is the only way to track a hidden folder without also tracking
// whichever non-hidden ancestor the picker can actually reach into.
async function addFolderByPathCommand(
	context: vscode.ExtensionContext,
	onFolderTracked: (folder: string) => void,
): Promise<void> {
	const typed = await vscode.window.showInputBox({
		title: 'Track Folder by Path',
		placeHolder: '/absolute/path/to/folder',
		prompt: 'Type a folder path, including hidden folders the file picker cannot show.',
		validateInput: validateFolderPath,
	});
	if (!typed) {
		return;
	}
	await addFolderCommand(context, onFolderTracked, vscode.Uri.file(typed.trim()));
}

async function untrackFolderCommand(
	context: vscode.ExtensionContext,
	folder: string,
	onFolderUntracked: (folder: string) => void,
): Promise<void> {
	try {
		await untrackFolder(context.globalState, folder);
		onFolderUntracked(folder);

		const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
		const index = workspaceFolders.findIndex((workspaceFolder) => workspaceFolder.uri.fsPath === folder);

		if (index === -1) {
			void vscode.window.showInformationMessage(`backtrail: stopped tracking "${basename(folder)}".`);
			return;
		}

		const removeAction = 'Remove from tree';
		const keepAction = 'Keep in tree';
		const choice = await vscode.window.showInformationMessage(
			`backtrail: stopped tracking "${basename(folder)}". Also remove it from your Explorer tree?`,
			removeAction,
			keepAction,
		);
		if (choice === removeAction) {
			vscode.workspace.updateWorkspaceFolders(index, 1);
		}
	} catch (error) {
		void vscode.window.showErrorMessage(
			`backtrail: couldn't stop tracking that folder — ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
