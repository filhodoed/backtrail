import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { OPEN_CHANGED_FILE_COMMAND, STOP_TRACKING_PATH_COMMAND } from '../changesCommands';
import { listExcludedPaths } from '../excludedPaths';
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
		const version = captureSnapshot(api.storeRoot, folder, randomUUID(), 'notas.md', Buffer.from('conteúdo'), false);
		const seriesId = findActiveSeriesId(api.storeRoot, folder, 'notas.md')!;
		assert.equal(getDecorationState(api.globalState, seriesId, version.timestamp), 'new');

		await vscode.commands.executeCommand(OPEN_CHANGED_FILE_COMMAND, folder, seriesId, undefined, version, true);

		assert.equal(getDecorationState(api.globalState, seriesId, version.timestamp), 'none');
	});

	test('stopping tracking a path from the Changes context menu excludes it immediately', async () => {
		captureSnapshot(api.storeRoot, folder, 'stop-tracking-series', 'cache/notas.md', Buffer.from('v1'), false);

		await vscode.commands.executeCommand(STOP_TRACKING_PATH_COMMAND, {
			kind: 'file',
			folder,
			relPath: 'cache/notas.md',
			state: 'new',
			seriesId: 'stop-tracking-series',
		});

		assert.deepEqual(listExcludedPaths(api.globalState, folder), ['cache/notas.md']);
	});

	test('does nothing when invoked on a group node instead of a file node', async () => {
		await vscode.commands.executeCommand(STOP_TRACKING_PATH_COMMAND, { kind: 'group', state: 'new', count: 1 });

		assert.deepEqual(listExcludedPaths(api.globalState, folder), []);
	});
});
