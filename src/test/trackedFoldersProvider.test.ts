import assert from 'node:assert/strict';
import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { BacktrailApi } from '../extension';

suite('Tracked Folders Provider Integration', () => {
	let api: BacktrailApi;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	test('lists no folders when nothing is tracked', () => {
		const children = api.trackedFoldersProvider.getChildren();

		assert.deepEqual(children, []);
	});

	test('returns no children for a leaf folder item', () => {
		const children = api.trackedFoldersProvider.getChildren('/tmp/whatever');

		assert.deepEqual(children, []);
	});

	test('tree item shows folder name as label and full path as description', () => {
		const folder = '/Users/someone/notes';

		const item = api.trackedFoldersProvider.getTreeItem(folder);

		assert.equal(item.label, basename(folder));
		assert.equal(item.description, folder);
		assert.equal(item.contextValue, 'backtrailTrackedFolder');
	});
});
