import * as vscode from 'vscode';
import { excludePath } from './excludedPaths';
import { purgePath } from './snapshotStore';

// Shared by the Monitor view's checkbox handler and the Changes view's "Stop
// tracking files on this path" context menu command — both need the exact
// same exclude-then-optionally-purge flow. Mirrors trackedFoldersCommands.ts's
// untrackFolderCommand: excluding (like untracking) is immediate and
// unconditional, deleting the already-saved history is a separate,
// fire-and-forget confirmation, since that part can't be undone.
export async function stopTrackingPath(
	globalState: vscode.Memento,
	storeRoot: string,
	folder: string,
	relPath: string,
	onChanged: () => void,
): Promise<void> {
	try {
		await excludePath(globalState, folder, relPath);
		onChanged();

		const deleteAction = 'Delete Saved History';
		const keepHistoryAction = 'Keep Saved History';
		void vscode.window
			.showWarningMessage(
				`backtrail: stopped tracking files under "${relPath}". Delete their saved history too? This can't be undone.`,
				deleteAction,
				keepHistoryAction,
			)
			.then((choice) => {
				if (choice !== deleteAction) {
					return;
				}
				const purgedCount = purgePath(storeRoot, folder, relPath);
				onChanged();
				void vscode.window.showInformationMessage(
					purgedCount === 0
						? `backtrail: no saved versions to purge under "${relPath}".`
						: `backtrail: purged ${purgedCount} saved version${purgedCount === 1 ? '' : 's'} under "${relPath}".`,
				);
			});
	} catch (error) {
		void vscode.window.showErrorMessage(
			`backtrail: couldn't stop tracking "${relPath}" — ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
