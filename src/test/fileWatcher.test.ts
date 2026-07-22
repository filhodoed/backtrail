import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RENAME_CORRELATION_WINDOW_MS, watchTrackedFolder } from '../fileWatcher';
import { findActiveSeriesId, listVersions } from '../snapshotStore';

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

suite('File Watcher Integration', () => {
	let trackedFolder: string;
	let storeRoot: string;
	let disposable: { dispose(): void };

	setup(async () => {
		trackedFolder = mkdtempSync(join(tmpdir(), 'backtrail-watch-folder-'));
		storeRoot = mkdtempSync(join(tmpdir(), 'backtrail-watch-store-'));
		disposable = watchTrackedFolder(trackedFolder, storeRoot);
		// The native watcher takes a moment to actually start listening after
		// creation; writing before it's hot means the event is missed outright,
		// not just delayed, so no amount of waiting after the fact recovers it.
		await new Promise((resolve) => setTimeout(resolve, 1000));
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

	test('creating a new subfolder does not throw EISDIR', async () => {
		writeFileSync(join(trackedFolder, 'notas.md'), 'trigger para dar tempo ao watcher');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'notas.md') !== undefined);

		mkdirSync(join(trackedFolder, 'nova-pasta'));

		await new Promise((resolve) => setTimeout(resolve, 500));

		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'nova-pasta');
		assert.equal(seriesId, undefined);
	});

	test('renaming a file outside VS Code continues the same series', async function () {
		this.timeout(35000);
		const oldPath = join(trackedFolder, 'antigo.md');
		const newPath = join(trackedFolder, 'novo.md');
		writeFileSync(oldPath, 'conteúdo que sobrevive ao rename');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'antigo.md') !== undefined);
		const originalSeriesId = findActiveSeriesId(storeRoot, trackedFolder, 'antigo.md')!;

		unlinkSync(oldPath);
		writeFileSync(newPath, 'conteúdo que sobrevive ao rename');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'novo.md') !== undefined);

		const newSeriesId = findActiveSeriesId(storeRoot, trackedFolder, 'novo.md');
		assert.equal(newSeriesId, originalSeriesId);
		assert.equal(listVersions(storeRoot, trackedFolder, originalSeriesId).length, 2);
	});

	test('deleting a file and creating unrelated content nearby does not merge series', async () => {
		const deletedPath = join(trackedFolder, 'a.md');
		writeFileSync(deletedPath, 'conteúdo de a');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'a.md') !== undefined);
		const originalSeriesId = findActiveSeriesId(storeRoot, trackedFolder, 'a.md')!;

		unlinkSync(deletedPath);
		writeFileSync(join(trackedFolder, 'c.md'), 'conteúdo totalmente diferente');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'c.md') !== undefined);

		const newSeriesId = findActiveSeriesId(storeRoot, trackedFolder, 'c.md');
		assert.notEqual(newSeriesId, originalSeriesId);
	});

	test('a real deletion is not matched once the correlation window expires', async function () {
		this.timeout(RENAME_CORRELATION_WINDOW_MS + 35000);

		const deletedPath = join(trackedFolder, 'velho.md');
		writeFileSync(deletedPath, 'conteúdo que não deveria mais ser correlacionado');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'velho.md') !== undefined);
		const originalSeriesId = findActiveSeriesId(storeRoot, trackedFolder, 'velho.md')!;

		unlinkSync(deletedPath);
		await new Promise((resolve) => setTimeout(resolve, RENAME_CORRELATION_WINDOW_MS + 500));

		writeFileSync(join(trackedFolder, 'novo-sem-relacao.md'), 'conteúdo que não deveria mais ser correlacionado');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'novo-sem-relacao.md') !== undefined);

		const newSeriesId = findActiveSeriesId(storeRoot, trackedFolder, 'novo-sem-relacao.md');
		assert.notEqual(newSeriesId, originalSeriesId);
	});
});
