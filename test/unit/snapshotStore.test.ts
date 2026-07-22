import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
	bucketIdFor,
	captureSnapshot,
	findActiveSeriesId,
	listVersions,
	pruneOlderThan,
	readSnapshotContent,
} from '../../src/snapshotStore.ts';

interface TestContext {
	after: (fn: () => void) => void;
}

function makeTempDir(t: TestContext, prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

test('should_compute_same_bucket_id_for_same_folder_across_calls', (t) => {
	const folder = makeTempDir(t, 'backtrail-folder-');

	const first = bucketIdFor(folder);
	const second = bucketIdFor(folder);

	assert.equal(first, second);
});

test('should_compute_different_bucket_ids_for_different_folders', (t) => {
	const folderA = makeTempDir(t, 'backtrail-folder-a-');
	const folderB = makeTempDir(t, 'backtrail-folder-b-');

	assert.notEqual(bucketIdFor(folderA), bucketIdFor(folderB));
});

test('should_capture_a_snapshot_and_list_it_back', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('primeira versão'), false);
	const versions = listVersions(storeRoot, folder, 'series-1');

	assert.equal(versions.length, 1);
	assert.equal(versions[0].relPath, 'notas.md');
	assert.equal(versions[0].isBinary, false);
});

test('should_capture_multiple_versions_in_chronological_order', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false, daysAgo(2));
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v2'), false, daysAgo(1));

	const versions = listVersions(storeRoot, folder, 'series-1');

	assert.equal(versions.length, 2);
	assert.ok(new Date(versions[0].timestamp) < new Date(versions[1].timestamp));
});

test('should_read_back_exact_content_of_a_captured_version', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	const version = captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('conteúdo exato'), false);
	const content = readSnapshotContent(storeRoot, folder, version);

	assert.equal(content.toString('utf8'), 'conteúdo exato');
});

test('should_dedupe_identical_content_into_a_single_blob_file', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'a.md', Buffer.from('mesmo conteúdo'), false);
	captureSnapshot(storeRoot, folder, 'series-2', 'b.md', Buffer.from('mesmo conteúdo'), false);

	const blobFiles = readdirSync(join(storeRoot, bucketId, 'blobs'));

	assert.equal(blobFiles.length, 1);
});

test('should_find_active_series_id_by_rel_path', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);

	const seriesId = findActiveSeriesId(storeRoot, folder, 'notas.md');

	assert.equal(seriesId, 'series-1');
});

test('should_return_undefined_when_no_series_matches_rel_path', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);

	const seriesId = findActiveSeriesId(storeRoot, folder, 'outro-arquivo.md');

	assert.equal(seriesId, undefined);
});

test('should_prune_versions_older_than_max_age_days', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('velho'), false, daysAgo(50));
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('recente'), false, daysAgo(1));

	const prunedCount = pruneOlderThan(storeRoot, folder, 45);

	assert.equal(prunedCount, 1);
});

test('should_keep_versions_within_max_age_after_prune', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('velho'), false, daysAgo(50));
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('recente'), false, daysAgo(1));

	pruneOlderThan(storeRoot, folder, 45);
	const remaining = listVersions(storeRoot, folder, 'series-1');

	assert.equal(remaining.length, 1);
	assert.equal(remaining[0].sizeBytes, Buffer.from('recente').byteLength);
});

test('should_remove_now_unreferenced_blob_after_prune', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('só essa versão'), false, daysAgo(50));

	pruneOlderThan(storeRoot, folder, 45);
	const blobFiles = readdirSync(join(storeRoot, bucketId, 'blobs'));

	assert.equal(blobFiles.length, 0);
});

test('should_keep_blob_still_referenced_by_another_series_after_prune', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'a.md', Buffer.from('conteúdo compartilhado'), false, daysAgo(50));
	captureSnapshot(storeRoot, folder, 'series-2', 'b.md', Buffer.from('conteúdo compartilhado'), false, daysAgo(1));

	pruneOlderThan(storeRoot, folder, 45);
	const blobFiles = readdirSync(join(storeRoot, bucketId, 'blobs'));

	assert.equal(blobFiles.length, 1);
});

test('should_remove_series_entirely_when_all_its_versions_are_pruned', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('velho'), false, daysAgo(50));

	pruneOlderThan(storeRoot, folder, 45);
	const seriesId = findActiveSeriesId(storeRoot, folder, 'notas.md');

	assert.equal(seriesId, undefined);
});
