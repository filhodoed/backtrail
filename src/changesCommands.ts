import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ChangesProvider } from './changesProvider';
import type { BacktrailDecorationProvider } from './decorationProvider';
import { SHOW_DIFF_COMMAND, SHOW_VERSION_INFO_COMMAND } from './diffCommand';
import { markSeen } from './seenVersions';
import type { SnapshotVersion } from './snapshotStore';

export const OPEN_CHANGED_FILE_COMMAND = 'backtrail.openChangedFile';

export function registerOpenChangedFileCommand(
	context: vscode.ExtensionContext,
	decorationProvider: BacktrailDecorationProvider,
	changesProvider: ChangesProvider,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			OPEN_CHANGED_FILE_COMMAND,
			async (
				folder: string,
				seriesId: string,
				older: SnapshotVersion | undefined,
				newer: SnapshotVersion,
				canDiff: boolean,
			) => {
				if (canDiff) {
					await vscode.commands.executeCommand(SHOW_DIFF_COMMAND, folder, older, newer);
				} else {
					await vscode.commands.executeCommand(SHOW_VERSION_INFO_COMMAND, newer);
				}

				// The Changes list opens a diff/info tab, not the file itself as
				// the active editor — so the usual "seen on active editor" path
				// never fires here. Mark it explicitly, or the entry never leaves
				// the list no matter how many times it's opened.
				await markSeen(context.globalState, seriesId, newer.timestamp);
				decorationProvider.refresh(vscode.Uri.file(join(folder, newer.relPath)));
				changesProvider.refresh();
			},
		),
	);
}
