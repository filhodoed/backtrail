import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchTrackedFolder } from '../fileWatcher';
import { findActiveSeriesId, listVersions } from '../snapshotStore';

async function waitUntil(condition: () => boolean, timeoutMs = 5000, intervalMs = 100): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error('waitUntil: condition not met before timeout');
}

suite('File Watcher Integration', () => {
	let trackedFolder: string;
	let storeRoot: string;
	let disposable: { dispose(): void };

	setup(() => {
		trackedFolder = mkdtempSync(join(tmpdir(), 'backtrail-watch-folder-'));
		storeRoot = mkdtempSync(join(tmpdir(), 'backtrail-watch-store-'));
		disposable = watchTrackedFolder(trackedFolder, storeRoot);
	});

	teardown(() => {
		disposable.dispose();
		rmSync(trackedFolder, { recursive: true, force: true });
		rmSync(storeRoot, { recursive: true, force: true });
	});

	test('saving a file in a tracked folder creates a snapshot entry', async () => {
		writeFileSync(join(trackedFolder, 'notas.md'), 'primeira versão');

		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'notas.md') !== undefined);

		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'notas.md');
		assert.ok(seriesId);
		const versions = listVersions(storeRoot, trackedFolder, seriesId);
		assert.equal(versions.length, 1);
		assert.equal(versions[0].relPath, 'notas.md');
		assert.equal(versions[0].isBinary, false);
	});

	test('changing a tracked file adds a second version to the same series', async () => {
		const filePath = join(trackedFolder, 'notas.md');
		writeFileSync(filePath, 'v1');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'notas.md') !== undefined);
		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'notas.md')!;

		writeFileSync(filePath, 'v2');
		await waitUntil(() => listVersions(storeRoot, trackedFolder, seriesId).length === 2);

		const versions = listVersions(storeRoot, trackedFolder, seriesId);
		assert.equal(versions.length, 2);
	});

	test('does not capture files inside a default-ignored folder', async () => {
		const ignoredDir = join(trackedFolder, 'node_modules');
		writeFileSync(join(trackedFolder, 'notas.md'), 'trigger para dar tempo ao watcher');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'notas.md') !== undefined);

		mkdirSync(ignoredDir, { recursive: true });
		writeFileSync(join(ignoredDir, 'left-pad.js'), 'module.exports = {}');

		await new Promise((resolve) => setTimeout(resolve, 500));

		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'node_modules/left-pad.js');
		assert.equal(seriesId, undefined);
	});
});
