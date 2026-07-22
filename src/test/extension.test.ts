import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { isTracked } from '../trackedFolders';
import type { BacktrailApi } from '../extension';

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
});
