import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { BacktrailApi } from '../extension';
import { RESTORE_VERSION_COMMAND } from '../restoreCommand';
import { captureSnapshot } from '../snapshotStore';

suite('Restore Command Integration', () => {
	let api: BacktrailApi;
	let folder: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	setup(() => {
		folder = mkdtempSync(join(tmpdir(), 'backtrail-restore-test-'));
	});

	teardown(() => {
		rmSync(folder, { recursive: true, force: true });
	});

	test('restoring a version writes it to restored/ without touching the live file', async () => {
		const timestamp = new Date(2026, 6, 20, 14, 32);
		const version = captureSnapshot(
			api.storeRoot,
			folder,
			'restore-test-series',
			'docs/notas.md',
			Buffer.from('versão antiga'),
			false,
			timestamp,
		);

		const destination = await vscode.commands.executeCommand<string>(RESTORE_VERSION_COMMAND, { folder, version });

		const expected = join(folder, 'restored', 'docs', 'notas.restored-2026-07-20-1432.md');
		assert.equal(destination, expected);
		assert.equal(readFileSync(expected, 'utf8'), 'versão antiga');
	});
});
