import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureBaselineSnapshots, RENAME_CORRELATION_WINDOW_MS, watchTrackedFolder } from '../fileWatcher';
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
		// Debounce off: this suite asserts on immediate second-capture behavior
		// (renames, corruption recovery, ignore rules), not on the debounce
		// feature itself — see the dedicated "File Watcher Debounce" suite below.
		disposable = watchTrackedFolder(trackedFolder, storeRoot, undefined, undefined, 0);
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

	test('a corrupt index.json does not crash the watcher — it self-heals on the next capture', async () => {
		writeFileSync(join(trackedFolder, 'notas.md'), 'trigger para dar tempo ao watcher');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'notas.md') !== undefined);

		const bucketId = readdirSync(storeRoot)[0];
		writeFileSync(join(storeRoot, bucketId, 'index.json'), '{ not valid json');

		writeFileSync(join(trackedFolder, 'depois.md'), 'deveria sobreviver ao índice corrompido');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'depois.md') !== undefined);

		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'depois.md')!;
		assert.equal(listVersions(storeRoot, trackedFolder, seriesId).length, 1);
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

	test('baseline capture snapshots a file that existed before tracking started', async () => {
		writeFileSync(join(trackedFolder, 'preexistente.md'), 'conteúdo de antes do tracking');

		await captureBaselineSnapshots(trackedFolder, storeRoot);

		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'preexistente.md');
		assert.ok(seriesId);
		assert.equal(listVersions(storeRoot, trackedFolder, seriesId).length, 1);
	});

	test('baseline capture gives the first real edit a genuine previous version to diff against', async () => {
		const filePath = join(trackedFolder, 'preexistente.md');
		writeFileSync(filePath, 'conteúdo de antes do tracking');
		await captureBaselineSnapshots(trackedFolder, storeRoot);
		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'preexistente.md')!;

		writeFileSync(filePath, 'conteúdo depois da primeira edição');
		await waitUntil(() => listVersions(storeRoot, trackedFolder, seriesId).length === 2);

		const versions = listVersions(storeRoot, trackedFolder, seriesId);
		assert.equal(versions.length, 2);
		assert.notEqual(versions[0].contentHash, versions[1].contentHash);
	});

	test('baseline capture does not duplicate a file already captured by the watcher', async () => {
		writeFileSync(join(trackedFolder, 'notas.md'), 'v1');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'notas.md') !== undefined);
		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'notas.md')!;

		await captureBaselineSnapshots(trackedFolder, storeRoot);

		assert.equal(listVersions(storeRoot, trackedFolder, seriesId).length, 1);
	});

	test('baseline capture skips files inside a default-ignored folder', async () => {
		mkdirSync(join(trackedFolder, 'node_modules'), { recursive: true });
		writeFileSync(join(trackedFolder, 'node_modules', 'left-pad.js'), 'module.exports = {}');

		await captureBaselineSnapshots(trackedFolder, storeRoot);

		assert.equal(findActiveSeriesId(storeRoot, trackedFolder, 'node_modules/left-pad.js'), undefined);
	});

	test('baseline capture chunks large trees and yields between chunks instead of blocking', async () => {
		const fileCount = 450; // more than two BASELINE_CHUNK_SIZE (200) chunks
		for (let i = 0; i < fileCount; i++) {
			writeFileSync(join(trackedFolder, `arquivo-${i}.md`), `conteúdo ${i}`);
		}

		await captureBaselineSnapshots(trackedFolder, storeRoot);

		for (const i of [0, 199, 200, 399, 449]) {
			const seriesId = findActiveSeriesId(storeRoot, trackedFolder, `arquivo-${i}.md`);
			assert.ok(seriesId, `arquivo-${i}.md should have been captured`);
		}
	});

	test('baseline capture stops early when cancelled', async () => {
		const fileCount = 450;
		for (let i = 0; i < fileCount; i++) {
			writeFileSync(join(trackedFolder, `arquivo-${i}.md`), `conteúdo ${i}`);
		}

		const token = { isCancellationRequested: true };
		await captureBaselineSnapshots(trackedFolder, storeRoot, undefined, token);

		// Cancelled before the first chunk even starts — nothing should have
		// been captured, and nothing should have thrown.
		assert.equal(findActiveSeriesId(storeRoot, trackedFolder, 'arquivo-0.md'), undefined);
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

suite('File Watcher Debounce', () => {
	const DEBOUNCE_MS = 300;

	let trackedFolder: string;
	let storeRoot: string;
	let disposable: { dispose(): void };

	setup(async () => {
		trackedFolder = mkdtempSync(join(tmpdir(), 'backtrail-debounce-folder-'));
		storeRoot = mkdtempSync(join(tmpdir(), 'backtrail-debounce-store-'));
		disposable = watchTrackedFolder(trackedFolder, storeRoot, undefined, undefined, DEBOUNCE_MS / 1000);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	});

	teardown(() => {
		disposable.dispose();
		rmSync(trackedFolder, { recursive: true, force: true });
		rmSync(storeRoot, { recursive: true, force: true });
	});

	test('consecutive saves of an already-tracked file within the debounce window collapse into one version', async () => {
		const filePath = join(trackedFolder, 'transcript.jsonl');
		writeFileSync(filePath, 'v1');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'transcript.jsonl') !== undefined);
		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'transcript.jsonl')!;

		writeFileSync(filePath, 'v2');
		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS / 2));
		writeFileSync(filePath, 'v3');
		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS / 2));
		writeFileSync(filePath, 'v4-final');

		await waitUntil(() => listVersions(storeRoot, trackedFolder, seriesId).length === 2, DEBOUNCE_MS + 5000);

		const versions = listVersions(storeRoot, trackedFolder, seriesId);
		assert.equal(versions.length, 2);
		assert.equal(versions[1].sizeBytes, Buffer.from('v4-final').byteLength);
	});

	test('disposing the watcher cancels a pending debounced capture', async () => {
		const filePath = join(trackedFolder, 'notas.md');
		writeFileSync(filePath, 'v1');
		await waitUntil(() => findActiveSeriesId(storeRoot, trackedFolder, 'notas.md') !== undefined);
		const seriesId = findActiveSeriesId(storeRoot, trackedFolder, 'notas.md')!;

		writeFileSync(filePath, 'v2 — nunca deveria ser capturada');
		disposable.dispose();

		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 500));

		assert.equal(listVersions(storeRoot, trackedFolder, seriesId).length, 1);
	});
});
