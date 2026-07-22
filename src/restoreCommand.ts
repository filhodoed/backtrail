import { relative } from 'node:path';
import * as vscode from 'vscode';
import { writeRestoredFile } from './restoreService';
import { readSnapshotContent, type SnapshotVersion } from './snapshotStore';

export const RESTORE_VERSION_COMMAND = 'backtrail.restoreVersion';

interface RestoreCommandArg {
	folder: string;
	version: SnapshotVersion;
}

export function registerRestoreCommand(context: vscode.ExtensionContext, storeRoot: string): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(RESTORE_VERSION_COMMAND, (arg: RestoreCommandArg) =>
			restoreVersion(storeRoot, arg.folder, arg.version),
		),
	);
}

function restoreVersion(storeRoot: string, folder: string, version: SnapshotVersion): string {
	const content = readSnapshotContent(storeRoot, folder, version);
	const destination = writeRestoredFile(folder, version.relPath, new Date(version.timestamp), content);

	void vscode.window
		.showInformationMessage(`backtrail: restored to ${relative(folder, destination)}`, 'Open')
		.then((choice) => {
			if (choice === 'Open') {
				return vscode.workspace.openTextDocument(destination).then((doc) => vscode.window.showTextDocument(doc));
			}
			return undefined;
		});

	return destination;
}
