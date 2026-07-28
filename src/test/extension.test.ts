import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { STOP_TRACKING_PATH_COMMAND } from '../changesCommands';
import { PRUNE_NOW_COMMAND } from '../extension';
import { captureSnapshot, listVersions } from '../snapshotStore';
import { isTracked, trackFolder, untrackFolder } from '../trackedFolders';
import type { BacktrailApi } from '../extension';

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

suite('Extension Test Suite', () => {
	let api: BacktrailApi;
	let tempRoot: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
		tempRoot = mkdtempSync(join(tmpdir(), 'backtrail-integration-'));
	});

	suiteTeardown(() => {
		rmSync(tempRoot, { recursive: true, force: true });
	});

	test('backtrail.trackFolder command is registered', async () => {
		const commands = await vscode.commands.getCommands(true);

		assert.ok(commands.includes('backtrail.trackFolder'));
	});

	test('backtrail.pruneNow command is registered', async () => {
		const commands = await vscode.commands.getCommands(true);

		assert.ok(commands.includes(PRUNE_NOW_COMMAND));
	});

	test('pruneNow removes snapshots older than the retention window for every tracked folder', async () => {
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-prunenow-test-'));
		await trackFolder(api.globalState, folder);

		try {
			captureSnapshot(api.storeRoot, folder, 'prune-now-series', 'notas.md', Buffer.from('velho'), false, daysAgo(50));

			await vscode.commands.executeCommand(PRUNE_NOW_COMMAND);

			assert.equal(listVersions(api.storeRoot, folder, 'prune-now-series').length, 0);
		} finally {
			await untrackFolder(api.globalState, folder);
			rmSync(folder, { recursive: true, force: true });
		}
	});

	test('refuses to track a folder inside a git repository', async () => {
		const gitFolder = join(tempRoot, 'has-git');
		mkdirSync(join(gitFolder, '.git'), { recursive: true });

		await vscode.commands.executeCommand('backtrail.trackFolder', vscode.Uri.file(gitFolder));

		assert.equal(isTracked(api.globalState, gitFolder), false);
	});

	test('tracks a plain folder without git', async () => {
		const plainFolder = join(tempRoot, 'plain');
		mkdirSync(plainFolder, { recursive: true });

		await vscode.commands.executeCommand('backtrail.trackFolder', vscode.Uri.file(plainFolder));

		assert.equal(isTracked(api.globalState, plainFolder), true);
	});

	test('excluding a path refreshes the Changes panel without a reload', async () => {
		const folder = mkdtempSync(join(tmpdir(), 'backtrail-exclusion-refresh-test-'));
		await trackFolder(api.globalState, folder);

		try {
			captureSnapshot(api.storeRoot, folder, 'exclusion-refresh-series', 'notas.md', Buffer.from('v1'), false);

			let fired = false;
			const subscription = api.changesProvider.onDidChangeTreeData(() => {
				fired = true;
			});

			try {
				await vscode.commands.executeCommand(STOP_TRACKING_PATH_COMMAND, {
					kind: 'file',
					folder,
					relPath: 'notas.md',
					state: 'new',
					seriesId: 'exclusion-refresh-series',
				});

				assert.equal(fired, true);
			} finally {
				subscription.dispose();
			}
		} finally {
			await untrackFolder(api.globalState, folder);
			rmSync(folder, { recursive: true, force: true });
		}
	});
});
