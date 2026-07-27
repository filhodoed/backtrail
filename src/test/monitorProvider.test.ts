import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { excludePath } from '../excludedPaths';
import type { BacktrailApi } from '../extension';
import { trackFolder, untrackFolder } from '../trackedFolders';

suite('Monitor Provider Integration', () => {
	let api: BacktrailApi;
	let folder: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	setup(async () => {
		folder = mkdtempSync(join(tmpdir(), 'backtrail-monitor-test-'));
		await trackFolder(api.globalState, folder);
	});

	teardown(async () => {
		await untrackFolder(api.globalState, folder);
		rmSync(folder, { recursive: true, force: true });
	});

	test('lists every tracked folder as a root node', () => {
		const roots = api.monitorProvider.getChildren();

		assert.ok(roots.some((node) => node.folder === folder && node.relPath === ''));
	});

	test('a root node has no checkbox state', () => {
		const item = api.monitorProvider.getTreeItem({ folder, relPath: '' });

		assert.equal(item.checkboxState, undefined);
	});

	test('lists real filesystem entries as children of a root node', () => {
		mkdirSync(join(folder, 'cache'));
		writeFileSync(join(folder, 'notas.md'), 'v1');

		const children = api.monitorProvider.getChildren({ folder, relPath: '' });

		assert.deepEqual(children.map((c) => c.relPath).sort(), ['cache', 'notas.md']);
	});

	test('lists nested entries under a subfolder node', () => {
		mkdirSync(join(folder, 'cache'));
		writeFileSync(join(folder, 'cache', 'a.md'), 'v1');

		const children = api.monitorProvider.getChildren({ folder, relPath: 'cache' });

		assert.deepEqual(
			children.map((c) => c.relPath),
			['cache/a.md'],
		);
	});

	test('returns no children for a file leaf node', () => {
		writeFileSync(join(folder, 'notas.md'), 'v1');

		const children = api.monitorProvider.getChildren({ folder, relPath: 'notas.md' });

		assert.deepEqual(children, []);
	});

	test('checks a path that has not been excluded', () => {
		writeFileSync(join(folder, 'notas.md'), 'v1');

		const item = api.monitorProvider.getTreeItem({ folder, relPath: 'notas.md' });

		assert.equal(item.checkboxState, vscode.TreeItemCheckboxState.Checked);
	});

	test('unchecks a path that was excluded directly', async () => {
		writeFileSync(join(folder, 'notas.md'), 'v1');
		await excludePath(api.globalState, folder, 'notas.md');

		const item = api.monitorProvider.getTreeItem({ folder, relPath: 'notas.md' });

		assert.equal(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
	});

	test('unchecks a path nested under an excluded ancestor folder', async () => {
		mkdirSync(join(folder, 'cache'));
		writeFileSync(join(folder, 'cache', 'a.md'), 'v1');
		await excludePath(api.globalState, folder, 'cache');

		const item = api.monitorProvider.getTreeItem({ folder, relPath: 'cache/a.md' });

		assert.equal(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
	});
});
