import { basename } from 'node:path';
import * as vscode from 'vscode';
import { isInsideGitRepo } from './gitGuard';
import { trackFolder } from './trackedFolders';

export function registerCommands(context: vscode.ExtensionContext, onFolderTracked: (folder: string) => void): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('backtrail.trackFolder', (folderUri?: vscode.Uri) =>
			trackFolderCommand(context, onFolderTracked, folderUri),
		),
	);
}

async function trackFolderCommand(
	context: vscode.ExtensionContext,
	onFolderTracked: (folder: string) => void,
	folderUri?: vscode.Uri,
): Promise<void> {
	const folder = folderUri ? { uri: folderUri, name: basename(folderUri.fsPath) } : await pickWorkspaceFolder();
	if (!folder) {
		return;
	}

	const absolutePath = folder.uri.fsPath;
	if (isInsideGitRepo(absolutePath)) {
		void vscode.window.showWarningMessage(
			`backtrail: "${folder.name}" is inside a git repository and cannot be tracked.`,
		);
		return;
	}

	await trackFolder(context.globalState, absolutePath);
	onFolderTracked(absolutePath);
	void vscode.window.showInformationMessage(`backtrail: now tracking "${folder.name}".`);
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		void vscode.window.showWarningMessage('backtrail: open a folder first.');
		return undefined;
	}
	if (folders.length === 1) {
		return folders[0];
	}
	return vscode.window.showWorkspaceFolderPick();
}
