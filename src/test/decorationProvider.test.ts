import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { markFileAsSeen } from '../decorationProvider';
import type { BacktrailApi } from '../extension';
import { captureSnapshot } from '../snapshotStore';
import { trackFolder, untrackFolder } from '../trackedFolders';

const noToken = new vscode.CancellationTokenSource().token;

suite('Decoration Provider Integration', () => {
	let api: BacktrailApi;
	let folder: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	setup(async () => {
		folder = mkdtempSync(join(tmpdir(), 'backtrail-decoration-test-'));
		await trackFolder(api.globalState, folder);
	});

	teardown(async () => {
		await untrackFolder(api.globalState, folder);
		rmSync(folder, { recursive: true, force: true });
	});

	test('badges a freshly captured file as new', async () => {
		captureSnapshot(api.storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
		const uri = vscode.Uri.file(join(folder, 'notas.md'));

		const decoration = await api.decorationProvider.provideFileDecoration(uri, noToken);

		assert.equal(decoration?.badge, 'N');
	});

	test('clears the badge once the file has been marked as seen', async () => {
		captureSnapshot(api.storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
		const uri = vscode.Uri.file(join(folder, 'notas.md'));

		await markFileAsSeen(api.globalState, api.storeRoot, uri, api.decorationProvider);
		const decoration = await api.decorationProvider.provideFileDecoration(uri, noToken);

		assert.equal(decoration, undefined);
	});

	test('badges a file changed again after being seen as changed, not new', async () => {
		captureSnapshot(api.storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
		const uri = vscode.Uri.file(join(folder, 'notas.md'));
		await markFileAsSeen(api.globalState, api.storeRoot, uri, api.decorationProvider);

		captureSnapshot(api.storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v2'), false);
		const decoration = await api.decorationProvider.provideFileDecoration(uri, noToken);

		assert.equal(decoration?.badge, 'M');
	});

	test('returns undefined for a file outside any tracked folder', async () => {
		const uri = vscode.Uri.file('/tmp/not-tracked/notas.md');

		const decoration = await api.decorationProvider.provideFileDecoration(uri, noToken);

		assert.equal(decoration, undefined);
	});
});
