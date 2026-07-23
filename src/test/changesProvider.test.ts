import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { markFileAsSeen } from '../decorationProvider';
import type { BacktrailApi } from '../extension';
import { captureSnapshot } from '../snapshotStore';
import { trackFolder, untrackFolder } from '../trackedFolders';

suite('Changes Provider Integration', () => {
	let api: BacktrailApi;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	test('lists no groups when nothing has changed', () => {
		const children = api.changesProvider.getChildren();

		assert.deepEqual(children, []);
	});

	test('returns no children for a leaf file item', () => {
		const children = api.changesProvider.getChildren({
			kind: 'file',
			folder: '/tmp/whatever',
			relPath: 'x.md',
			state: 'new',
			seriesId: 'series-1',
		});

		assert.deepEqual(children, []);
	});

	suite('with a tracked folder that has changes', () => {
		let folder: string;

		setup(async () => {
			folder = mkdtempSync(join(tmpdir(), 'backtrail-changesprovider-test-'));
			await trackFolder(api.globalState, folder);
		});

		teardown(async () => {
			await untrackFolder(api.globalState, folder);
			rmSync(folder, { recursive: true, force: true });
		});

		test('groups an unseen file under New and a seen-then-edited file under Modified', async () => {
			captureSnapshot(api.storeRoot, folder, 'changesprovider-series-new', 'novo.md', Buffer.from('v1'), false);

			captureSnapshot(api.storeRoot, folder, 'changesprovider-series-changed', 'editado.md', Buffer.from('v1'), false);
			await markFileAsSeen(api.globalState, api.storeRoot, vscode.Uri.file(join(folder, 'editado.md')), api.decorationProvider);
			captureSnapshot(api.storeRoot, folder, 'changesprovider-series-changed', 'editado.md', Buffer.from('v2'), false);

			const groups = api.changesProvider.getChildren();
			assert.equal(groups.length, 2);

			const changedGroup = groups.find((g) => g.kind === 'group' && g.state === 'changed')!;
			const newGroup = groups.find((g) => g.kind === 'group' && g.state === 'new')!;
			assert.ok(changedGroup);
			assert.ok(newGroup);

			const changedFiles = api.changesProvider.getChildren(changedGroup);
			const newFiles = api.changesProvider.getChildren(newGroup);
			assert.deepEqual(
				changedFiles.map((f) => f.kind === 'file' && f.relPath),
				['editado.md'],
			);
			assert.deepEqual(
				newFiles.map((f) => f.kind === 'file' && f.relPath),
				['novo.md'],
			);
		});

		test('a file with no pending change surfaces no groups at all', async () => {
			captureSnapshot(api.storeRoot, folder, 'changesprovider-series-no-pending', 'notas.md', Buffer.from('v1'), false);
			await markFileAsSeen(api.globalState, api.storeRoot, vscode.Uri.file(join(folder, 'notas.md')), api.decorationProvider);

			const groups = api.changesProvider.getChildren();

			assert.deepEqual(groups, []);
		});

		test('a tracked folder that no longer exists on disk does not break the list for other folders', async () => {
			const goneFolder = mkdtempSync(join(tmpdir(), 'backtrail-changesprovider-gone-'));
			await trackFolder(api.globalState, goneFolder);
			rmSync(goneFolder, { recursive: true, force: true });

			captureSnapshot(api.storeRoot, folder, 'changesprovider-series-survivor', 'sobrevive.md', Buffer.from('v1'), false);

			try {
				const groups = api.changesProvider.getChildren();
				const newGroup = groups.find((g) => g.kind === 'group' && g.state === 'new')!;
				const newFiles = api.changesProvider.getChildren(newGroup);
				assert.deepEqual(
					newFiles.map((f) => f.kind === 'file' && f.relPath),
					['sobrevive.md'],
				);
			} finally {
				await untrackFolder(api.globalState, goneFolder);
			}
		});
	});
});
