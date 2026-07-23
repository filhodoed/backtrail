import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { getDecorationState } from '../seenVersions';
import { captureSnapshot, findActiveSeriesId } from '../snapshotStore';
import { ADD_FOLDER_COMMAND, MARK_FOLDER_SEEN_COMMAND, UNTRACK_FOLDER_COMMAND } from '../trackedFoldersCommands';
import { isTracked, untrackFolder } from '../trackedFolders';
import type { BacktrailApi } from '../extension';

function waitForWorkspaceFolderChange(timeoutMs = 10000): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			disposable.dispose();
			reject(new Error('waitForWorkspaceFolderChange: timed out'));
		}, timeoutMs);
		const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			clearTimeout(timer);
			disposable.dispose();
			resolve();
		});
	});
}

suite('Tracked Folders Commands Integration', () => {
	let api: BacktrailApi;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	test('addFolder tracks the given folder and appends it to the workspace', async () => {
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-addfolder-test-'));
		const beforeCount = (vscode.workspace.workspaceFolders ?? []).length;

		try {
			const changed = waitForWorkspaceFolderChange();
			await vscode.commands.executeCommand(ADD_FOLDER_COMMAND, vscode.Uri.file(folder));
			await changed;

			assert.equal(isTracked(api.globalState, folder), true);
			const afterFolders = vscode.workspace.workspaceFolders ?? [];
			assert.equal(afterFolders.length, beforeCount + 1);
			assert.equal(afterFolders[afterFolders.length - 1].uri.fsPath, folder);
		} finally {
			const index = (vscode.workspace.workspaceFolders ?? []).findIndex((f) => f.uri.fsPath === folder);
			if (index !== -1) {
				const removed = waitForWorkspaceFolderChange();
				vscode.workspace.updateWorkspaceFolders(index, 1);
				await removed;
			}
			await untrackFolder(api.globalState, folder);
			rmSync(folder, { recursive: true, force: true });
		}
	});

	test('addFolder refuses a folder inside a git repository', async () => {
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-addfolder-git-test-'));
		mkdirSync(join(folder, '.git'));
		const beforeCount = (vscode.workspace.workspaceFolders ?? []).length;

		try {
			await vscode.commands.executeCommand(ADD_FOLDER_COMMAND, vscode.Uri.file(folder));

			assert.equal(isTracked(api.globalState, folder), false);
			assert.equal((vscode.workspace.workspaceFolders ?? []).length, beforeCount);
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	});

	test('untrackFolder stops tracking a folder that is not part of the workspace', async () => {
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-untrack-test-'));
		const added = waitForWorkspaceFolderChange();
		await vscode.commands.executeCommand(ADD_FOLDER_COMMAND, vscode.Uri.file(folder));
		await added;

		const index = (vscode.workspace.workspaceFolders ?? []).findIndex((f) => f.uri.fsPath === folder);
		if (index !== -1) {
			const removed = waitForWorkspaceFolderChange();
			vscode.workspace.updateWorkspaceFolders(index, 1);
			await removed;
		}
		assert.equal(isTracked(api.globalState, folder), true);

		try {
			await vscode.commands.executeCommand(UNTRACK_FOLDER_COMMAND, folder);

			assert.equal(isTracked(api.globalState, folder), false);
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	});

	test('markFolderSeen clears New/Modified state for every file in the folder at once', async () => {
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-markseen-test-'));
		await vscode.commands.executeCommand('backtrail.trackFolder', vscode.Uri.file(folder));

		try {
			const a = captureSnapshot(api.storeRoot, folder, 'markseen-series-a', 'a.md', Buffer.from('v1'), false);
			const b = captureSnapshot(api.storeRoot, folder, 'markseen-series-b', 'b.md', Buffer.from('v1'), false);
			assert.equal(getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'a.md')!, a.timestamp), 'new');
			assert.equal(getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'b.md')!, b.timestamp), 'new');

			await vscode.commands.executeCommand(MARK_FOLDER_SEEN_COMMAND, folder);

			assert.equal(getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'a.md')!, a.timestamp), 'none');
			assert.equal(getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'b.md')!, b.timestamp), 'none');
		} finally {
			await untrackFolder(api.globalState, folder);
			rmSync(folder, { recursive: true, force: true });
		}
	});
});
