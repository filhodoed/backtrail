import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { OPEN_CHANGED_FILE_COMMAND } from '../changesCommands';
import type { BacktrailApi } from '../extension';
import { getDecorationState } from '../seenVersions';
import { captureSnapshot, findActiveSeriesId } from '../snapshotStore';
import { trackFolder, untrackFolder } from '../trackedFolders';

suite('Changes Commands Integration', () => {
	let api: BacktrailApi;
	let folder: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	setup(async () => {
		folder = mkdtempSync(join(tmpdir(), 'backtrail-openchange-test-'));
		await trackFolder(api.globalState, folder);
	});

	teardown(async () => {
		await untrackFolder(api.globalState, folder);
		rmSync(folder, { recursive: true, force: true });
	});

	test('opening a changed file from the sidebar marks it as seen', async () => {
		const version = captureSnapshot(api.storeRoot, folder, 'openchange-series', 'notas.md', Buffer.from('conteúdo'), false);
		const seriesId = findActiveSeriesId(api.storeRoot, folder, 'notas.md')!;
		assert.equal(getDecorationState(api.globalState, seriesId, version.timestamp), 'new');

		await vscode.commands.executeCommand(OPEN_CHANGED_FILE_COMMAND, folder, seriesId, undefined, version, true);

		assert.equal(getDecorationState(api.globalState, seriesId, version.timestamp), 'none');
	});
});
