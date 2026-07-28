import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { getDecorationState } from '../seenVersions';
import { captureSnapshot, findActiveSeriesId } from '../snapshotStore';
import {
	ADD_FOLDER_COMMAND,
	MARK_FOLDER_SEEN_COMMAND,
	UNTRACK_FOLDER_COMMAND,
	validateFolderPath,
} from '../trackedFoldersCommands';
import { isTracked, untrackFolder } from '../trackedFolders';
import type { BacktrailApi } from '../extension';

function hasWorkspaceFolder(path: string): boolean {
	return (vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === path);
}

// A plain onDidChangeWorkspaceFolders listener resolves on the next change
// event, whatever it was — a stale folder from an earlier, timed-out run
// being reconciled away by VS Code itself fires that same event, resolving
// this for the wrong reason before the folder this call actually cares
// about has been added/removed. Checking the specific condition (and
// short-circuiting if it's already true) makes this robust to any change
// event, not just the one the caller is expecting.
function waitForWorkspaceFolder(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
	if (predicate()) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			disposable.dispose();
			reject(new Error('waitForWorkspaceFolder: timed out'));
		}, timeoutMs);
		const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			if (predicate()) {
				clearTimeout(timer);
				disposable.dispose();
				resolve();
			}
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

	test('addFolder tracks the given folder and appends it to the workspace', async function () {
		// A fresh test profile's very first updateWorkspaceFolders round trip
		// pays a one-time Electron/extension-host cold-start cost that later
		// calls don't — comfortably longer than mocha's default budget, and
		// occasionally longer than even this one under system load. Retrying
		// catches that without masking a real regression: an actual bug in
		// the add/remove flow would fail the same way on every retry too.
		this.timeout(30000);
		this.retries(2);
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-addfolder-test-'));
		const beforeCount = (vscode.workspace.workspaceFolders ?? []).length;

		try {
			const changed = waitForWorkspaceFolder(() => hasWorkspaceFolder(folder), 25000);
			await vscode.commands.executeCommand(ADD_FOLDER_COMMAND, vscode.Uri.file(folder));
			await changed;

			assert.equal(isTracked(api.globalState, folder), true);
			const afterFolders = vscode.workspace.workspaceFolders ?? [];
			assert.equal(afterFolders.length, beforeCount + 1);
			assert.equal(afterFolders[afterFolders.length - 1].uri.fsPath, folder);
		} finally {
			const index = (vscode.workspace.workspaceFolders ?? []).findIndex((f) => f.uri.fsPath === folder);
			if (index !== -1) {
				const removed = waitForWorkspaceFolder(() => !hasWorkspaceFolder(folder), 25000);
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

	test('untrackFolder stops tracking a folder that is not part of the workspace', async function () {
		this.timeout(30000);
		this.retries(2);
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-untrack-test-'));
		const added = waitForWorkspaceFolder(() => hasWorkspaceFolder(folder), 25000);
		await vscode.commands.executeCommand(ADD_FOLDER_COMMAND, vscode.Uri.file(folder));
		await added;

		const index = (vscode.workspace.workspaceFolders ?? []).findIndex((f) => f.uri.fsPath === folder);
		if (index !== -1) {
			const removed = waitForWorkspaceFolder(() => !hasWorkspaceFolder(folder), 25000);
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
			const a = captureSnapshot(api.storeRoot, folder, randomUUID(), 'a.md', Buffer.from('v1'), false);
			const b = captureSnapshot(api.storeRoot, folder, randomUUID(), 'b.md', Buffer.from('v1'), false);
			assert.equal(
				getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'a.md')!, a.timestamp),
				'new',
			);
			assert.equal(
				getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'b.md')!, b.timestamp),
				'new',
			);

			await vscode.commands.executeCommand(MARK_FOLDER_SEEN_COMMAND, folder);

			assert.equal(
				getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'a.md')!, a.timestamp),
				'none',
			);
			assert.equal(
				getDecorationState(api.globalState, findActiveSeriesId(api.storeRoot, folder, 'b.md')!, b.timestamp),
				'none',
			);
		} finally {
			await untrackFolder(api.globalState, folder);
			rmSync(folder, { recursive: true, force: true });
		}
	});

	test('validateFolderPath rejects an empty path', () => {
		assert.ok(validateFolderPath('   '));
	});

	test('validateFolderPath rejects a path that does not exist', () => {
		assert.ok(validateFolderPath('/definitely/not/a/real/path/backtrail-test'));
	});

	test('validateFolderPath rejects a path that is a file, not a folder', () => {
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-validate-test-'));
		const filePath = join(folder, 'notas.md');
		try {
			mkdirSync(folder, { recursive: true });
			writeFileSync(filePath, 'conteúdo');
			assert.ok(validateFolderPath(filePath));
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	});

	test('validateFolderPath accepts an existing folder, including a hidden one', () => {
		const parent = mkdtempSync(join(tmpdir(), 'backtrail-validate-test-'));
		const hidden = join(parent, '.backtrail-hidden');
		try {
			mkdirSync(hidden);
			assert.equal(validateFolderPath(hidden), undefined);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});
});
