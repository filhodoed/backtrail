import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { SHOW_DIFF_COMMAND, SHOW_VERSION_INFO_COMMAND } from '../diffCommand';
import type { BacktrailApi } from '../extension';
import { BacktrailHistoryProvider, type VersionTreeItem } from '../historyTreeProvider';
import { captureSnapshot, type SnapshotVersion } from '../snapshotStore';

async function waitUntil(condition: () => boolean, timeoutMs = 10000, intervalMs = 100): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error('waitUntil: condition not met before timeout');
}

function findDiffTab(): vscode.Tab | undefined {
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			if (tab.input instanceof vscode.TabInputTextDiff) {
				return tab;
			}
		}
	}
	return undefined;
}

function makeVersion(overrides: Partial<SnapshotVersion>): SnapshotVersion {
	return {
		relPath: 'notas.md',
		timestamp: new Date().toISOString(),
		sizeBytes: 10,
		isBinary: false,
		contentHash: 'hash',
		...overrides,
	};
}

suite('Diff Command Integration', () => {
	let api: BacktrailApi;
	let folder: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('filhodoed.backtrail');
		assert.ok(ext, 'extension should be discoverable by id');
		api = (await ext.activate()) as BacktrailApi;
	});

	setup(() => {
		folder = mkdtempSync(join(tmpdir(), 'backtrail-diff-test-'));
	});

	teardown(() => {
		rmSync(folder, { recursive: true, force: true });
	});

	test('opens a diff tab with the original filename and extension preserved', async () => {
		const older = captureSnapshot(api.storeRoot, folder, 'diff-test-series', 'foto.md', Buffer.from('v1'), false);
		const newer = captureSnapshot(api.storeRoot, folder, 'diff-test-series', 'foto.md', Buffer.from('v2'), false);

		await vscode.commands.executeCommand(SHOW_DIFF_COMMAND, folder, older, newer);
		await waitUntil(() => findDiffTab() !== undefined);

		const tab = findDiffTab();
		assert.ok(tab);
		const input = tab.input as vscode.TabInputTextDiff;
		assert.equal(basename(input.original.fsPath), 'foto.md');
		assert.equal(basename(input.modified.fsPath), 'foto.md');
	});

	test('showing version info for a non-diffable binary does not throw', async () => {
		const version = makeVersion({ relPath: 'apresentacao.pptx', isBinary: true });

		await vscode.commands.executeCommand(SHOW_VERSION_INFO_COMMAND, version);
	});

	test('tree item wires the diff command when a previous version exists', () => {
		const provider = new BacktrailHistoryProvider({ globalState: api.globalState } as vscode.ExtensionContext, api.storeRoot);
		const element: VersionTreeItem = {
			version: makeVersion({ timestamp: new Date().toISOString() }),
			previousVersion: makeVersion({ timestamp: new Date(Date.now() - 1000).toISOString() }),
			folder: '/tmp/whatever',
			index: 1,
		};

		const item = provider.getTreeItem(element);

		assert.equal(item.command?.command, SHOW_DIFF_COMMAND);
	});

	test('tree item wires the diff command against an empty original for the first version in a series', () => {
		const provider = new BacktrailHistoryProvider({ globalState: api.globalState } as vscode.ExtensionContext, api.storeRoot);
		const element: VersionTreeItem = {
			version: makeVersion({}),
			previousVersion: undefined,
			folder: '/tmp/whatever',
			index: 0,
		};

		const item = provider.getTreeItem(element);

		assert.equal(item.command?.command, SHOW_DIFF_COMMAND);
		assert.equal(item.command?.arguments?.[1], undefined);
	});

	test('shows a diff against an empty original when the file has no previous version', async () => {
		const first = captureSnapshot(api.storeRoot, folder, 'diff-test-series-first', 'nova.md', Buffer.from('conteudo inicial'), false);

		await vscode.commands.executeCommand(SHOW_DIFF_COMMAND, folder, undefined, first);
		await waitUntil(() => findDiffTab() !== undefined);

		const tab = findDiffTab();
		assert.ok(tab);
		const input = tab.input as vscode.TabInputTextDiff;
		assert.equal(basename(input.original.fsPath), 'nova.md');
		assert.equal(basename(input.modified.fsPath), 'nova.md');
	});

	test('tree item wires the version-info command for non-diffable binaries', () => {
		const provider = new BacktrailHistoryProvider({ globalState: api.globalState } as vscode.ExtensionContext, api.storeRoot);
		const element: VersionTreeItem = {
			version: makeVersion({ relPath: 'video.mp4', isBinary: true }),
			previousVersion: makeVersion({ relPath: 'video.mp4', isBinary: true }),
			folder: '/tmp/whatever',
			index: 1,
		};

		const item = provider.getTreeItem(element);

		assert.equal(item.command?.command, SHOW_VERSION_INFO_COMMAND);
	});
});
