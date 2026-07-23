import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { captureBaselineSnapshots, watchTrackedFolder } from '../fileWatcher';
import { trackFolder } from '../trackedFolders';
import type { BacktrailApi } from '../extension';

async function waitUntil(condition: () => boolean, timeoutMs = 15000, intervalMs = 100): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error('waitUntil: condition not met before timeout');
}

suite('History Tree Provider Integration', () => {
	let api: BacktrailApi;
	let trackedFolder: string;
	let watcherDisposable: vscode.Disposable;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	setup(async () => {
		trackedFolder = mkdtempSync(join(tmpdir(), 'backtrail-history-folder-'));
		await trackFolder(api.globalState, trackedFolder);
		watcherDisposable = watchTrackedFolder(trackedFolder, api.storeRoot, undefined, (uri) =>
			api.historyProvider.notifyChange(uri),
		);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	});

	teardown(() => {
		watcherDisposable.dispose();
		rmSync(trackedFolder, { recursive: true, force: true });
	});

	test('lists no versions when nothing is active', () => {
		api.historyProvider.setActiveUri(undefined);

		assert.deepEqual(api.historyProvider.getChildren(), []);
	});

	test('lists captured versions for the active editor file, newest first', async () => {
		const filePath = join(trackedFolder, 'notas.md');
		writeFileSync(filePath, 'v1');

		const doc = await vscode.workspace.openTextDocument(filePath);
		await vscode.window.showTextDocument(doc);
		await waitUntil(() => api.historyProvider.getChildren().length === 1);

		writeFileSync(filePath, 'v2');
		await waitUntil(() => api.historyProvider.getChildren().length === 2);

		const children = api.historyProvider.getChildren();
		assert.equal(children.length, 2);
		assert.ok(children[0].version.timestamp >= children[1].version.timestamp);
	});

	test('the first edit after tracking a pre-existing file diffs against its real prior content, not empty', async () => {
		const filePath = join(trackedFolder, 'preexistente.md');
		writeFileSync(filePath, 'conteúdo de antes do tracking');
		captureBaselineSnapshots(trackedFolder, api.storeRoot);

		const doc = await vscode.workspace.openTextDocument(filePath);
		await vscode.window.showTextDocument(doc);
		await waitUntil(() => api.historyProvider.getChildren().length === 1);

		writeFileSync(filePath, 'conteúdo depois da primeira edição');
		await waitUntil(() => api.historyProvider.getChildren().length === 2);

		const [newest] = api.historyProvider.getChildren();
		assert.ok(newest.previousVersion, 'the first real edit should have a baseline to diff against');
		assert.equal(newest.previousVersion?.sizeBytes, Buffer.byteLength('conteúdo de antes do tracking'));
	});

	test('returns no children for a leaf tree item', () => {
		const children = api.historyProvider.getChildren({
			version: { relPath: 'x.md', timestamp: new Date().toISOString(), sizeBytes: 1, isBinary: false, contentHash: 'x' },
			folder: trackedFolder,
			index: 0,
		});

		assert.deepEqual(children, []);
	});
});
