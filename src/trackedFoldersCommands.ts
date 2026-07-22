import { basename } from 'node:path';
import * as vscode from 'vscode';
import { isInsideGitRepo } from './gitGuard';
import { trackFolder, untrackFolder } from './trackedFolders';

export const ADD_FOLDER_COMMAND = 'backtrail.addFolder';
export const UNTRACK_FOLDER_COMMAND = 'backtrail.untrackFolder';

export function registerTrackedFoldersCommands(
	context: vscode.ExtensionContext,
	onFolderTracked: (folder: string) => void,
	onFolderUntracked: (folder: string) => void,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(ADD_FOLDER_COMMAND, (folderUri?: vscode.Uri) =>
			addFolderCommand(context, onFolderTracked, folderUri),
		),
		vscode.commands.registerCommand(UNTRACK_FOLDER_COMMAND, (folder: string) =>
			untrackFolderCommand(context, folder, onFolderUntracked),
		),
	);
}

async function addFolderCommand(
	context: vscode.ExtensionContext,
	onFolderTracked: (folder: string) => void,
	folderUri?: vscode.Uri,
): Promise<void> {
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

	await trackFolder(context.globalState, absolutePath);
	onFolderTracked(absolutePath);

	// Always append — start index is the current folder count, delete count
	// is 0 — never replaces the existing workspace folders.
	const existing = vscode.workspace.workspaceFolders ?? [];
	const alreadyOpen = existing.some((folder) => folder.uri.fsPath === absolutePath);
	if (!alreadyOpen) {
		vscode.workspace.updateWorkspaceFolders(existing.length, 0, { uri: folderUri });
	}

	void vscode.window.showInformationMessage(`backtrail: now tracking "${basename(absolutePath)}".`);
}

async function untrackFolderCommand(
	context: vscode.ExtensionContext,
	folder: string,
	onFolderUntracked: (folder: string) => void,
): Promise<void> {
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
}
