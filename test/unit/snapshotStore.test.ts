import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import {
	bucketIdFor,
	captureSnapshot,
	captureSnapshotsBatch,
	deleteBucket,
	findActiveSeriesId,
	hardenBucketPermissions,
	listVersions,
	pruneOlderThan,
	purgePath,
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

test('should_not_append_a_new_version_when_content_is_identical_to_the_last_one', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false, daysAgo(2));
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false, daysAgo(1));

	const versions = listVersions(storeRoot, folder, 'series-1');

	assert.equal(versions.length, 1);
});

test('should_not_rewrite_the_index_file_on_disk_for_a_no_op_capture', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	const indexPath = join(storeRoot, bucketId, 'index.json');
	const mtimeAfterFirstCapture = statSync(indexPath).mtimeMs;

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);

	assert.equal(statSync(indexPath).mtimeMs, mtimeAfterFirstCapture);
});

test('should_append_a_new_version_for_a_rename_even_when_content_is_unchanged', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'antigo.md', Buffer.from('conteúdo'), false, daysAgo(1));
	captureSnapshot(storeRoot, folder, 'series-1', 'novo.md', Buffer.from('conteúdo'), false);

	const versions = listVersions(storeRoot, folder, 'series-1');

	assert.equal(versions.length, 2);
	assert.equal(versions[1].relPath, 'novo.md');
});

test('should_append_a_new_version_when_content_differs_from_the_last_one_even_if_seen_before', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false, daysAgo(3));
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v2'), false, daysAgo(2));
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false, daysAgo(1));

	const versions = listVersions(storeRoot, folder, 'series-1');

	assert.equal(versions.length, 3);
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

test('should_cap_a_series_to_the_configured_max_versions_keeping_the_most_recent', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	for (let i = 0; i < 5; i++) {
		captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from(`v${i}`), false, daysAgo(1));
	}

	const prunedCount = pruneOlderThan(storeRoot, folder, 45, new Date(), 3);
	const remaining = listVersions(storeRoot, folder, 'series-1');

	assert.equal(prunedCount, 2);
	assert.equal(remaining.length, 3);
	assert.deepEqual(
		remaining.map((v) => v.sizeBytes),
		[2, 3, 4].map((i) => Buffer.from(`v${i}`).byteLength),
	);
});

test('should_remove_blob_orphaned_by_the_version_cap', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(
		storeRoot,
		folder,
		'series-1',
		'notas.md',
		Buffer.from('versão descartada pelo cap'),
		false,
		daysAgo(1),
	);
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('versão mantida'), false, daysAgo(1));

	pruneOlderThan(storeRoot, folder, 45, new Date(), 1);
	const blobFiles = readdirSync(join(storeRoot, bucketId, 'blobs'));

	assert.equal(blobFiles.length, 1);
});

test('should_purge_a_series_currently_living_under_the_given_path_prefix', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'cache/notas.md', Buffer.from('v1'), false);
	captureSnapshot(storeRoot, folder, 'series-2', 'notas.md', Buffer.from('v1'), false);

	const purgedCount = purgePath(storeRoot, folder, 'cache');

	assert.equal(purgedCount, 1);
	assert.equal(findActiveSeriesId(storeRoot, folder, 'cache/notas.md'), undefined);
	assert.equal(findActiveSeriesId(storeRoot, folder, 'notas.md'), 'series-2');
});

test('should_not_purge_a_series_whose_current_rel_path_is_outside_the_prefix_even_if_an_old_version_was_inside_it', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'cache/notas.md', Buffer.from('v1'), false, daysAgo(2));
	// Renamed out of the excluded folder — the series is now live elsewhere.
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false, daysAgo(1));

	const purgedCount = purgePath(storeRoot, folder, 'cache');

	assert.equal(purgedCount, 0);
	assert.equal(findActiveSeriesId(storeRoot, folder, 'notas.md'), 'series-1');
});

test('should_not_purge_a_folder_whose_name_only_partially_matches_the_prefix', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'cache-backup/notas.md', Buffer.from('v1'), false);

	const purgedCount = purgePath(storeRoot, folder, 'cache');

	assert.equal(purgedCount, 0);
	assert.equal(findActiveSeriesId(storeRoot, folder, 'cache-backup/notas.md'), 'series-1');
});

test('should_remove_blob_orphaned_by_a_path_purge', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'cache/notas.md', Buffer.from('conteúdo único'), false);

	purgePath(storeRoot, folder, 'cache');
	const blobFiles = readdirSync(join(storeRoot, bucketId, 'blobs'));

	assert.equal(blobFiles.length, 0);
});

test('should_keep_blob_still_referenced_outside_the_purged_path', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'cache/a.md', Buffer.from('conteúdo compartilhado'), false);
	captureSnapshot(storeRoot, folder, 'series-2', 'b.md', Buffer.from('conteúdo compartilhado'), false);

	purgePath(storeRoot, folder, 'cache');
	const blobFiles = readdirSync(join(storeRoot, bucketId, 'blobs'));

	assert.equal(blobFiles.length, 1);
	assert.equal(findActiveSeriesId(storeRoot, folder, 'b.md'), 'series-2');
});

test('should_be_a_no_op_purging_a_path_with_nothing_under_it', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);

	const purgedCount = purgePath(storeRoot, folder, 'cache');

	assert.equal(purgedCount, 0);
	assert.equal(findActiveSeriesId(storeRoot, folder, 'notas.md'), 'series-1');
});

test('should_treat_a_corrupt_index_as_empty_instead_of_throwing', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('antes da corrupção'), false);
	writeFileSync(join(storeRoot, bucketId, 'index.json'), '{ not valid json');

	const seriesId = findActiveSeriesId(storeRoot, folder, 'notas.md');

	assert.equal(seriesId, undefined);
});

test('should_self_heal_a_corrupt_index_on_the_next_capture', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('antes da corrupção'), false);
	writeFileSync(join(storeRoot, bucketId, 'index.json'), '{ not valid json');

	captureSnapshot(storeRoot, folder, 'series-2', 'depois.md', Buffer.from('depois da corrupção'), false);
	const versions = listVersions(storeRoot, folder, 'series-2');

	assert.equal(versions.length, 1);
	assert.equal(versions[0].relPath, 'depois.md');
});

test('should_write_the_index_only_once_for_a_whole_batch', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshotsBatch(storeRoot, folder, [
		{ seriesId: 'series-1', relPath: 'a.md', content: Buffer.from('conteúdo a'), isBinary: false },
		{ seriesId: 'series-2', relPath: 'b.md', content: Buffer.from('conteúdo b'), isBinary: false },
		{ seriesId: 'series-3', relPath: 'c.md', content: Buffer.from('conteúdo c'), isBinary: false },
	]);

	assert.equal(findActiveSeriesId(storeRoot, folder, 'a.md'), 'series-1');
	assert.equal(findActiveSeriesId(storeRoot, folder, 'b.md'), 'series-2');
	assert.equal(findActiveSeriesId(storeRoot, folder, 'c.md'), 'series-3');
});

test('should_be_a_no_op_for_an_empty_batch', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshotsBatch(storeRoot, folder, []);

	assert.equal(findActiveSeriesId(storeRoot, folder, 'anything.md'), undefined);
});

test('should_skip_a_batch_entry_whose_rel_path_already_has_an_active_series', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'real-edit-series', 'notas.md', Buffer.from('edição real'), false);

	captureSnapshotsBatch(storeRoot, folder, [
		{ seriesId: 'baseline-series', relPath: 'notas.md', content: Buffer.from('conteúdo de baseline'), isBinary: false },
	]);

	assert.equal(findActiveSeriesId(storeRoot, folder, 'notas.md'), 'real-edit-series');
	assert.equal(listVersions(storeRoot, folder, 'real-edit-series').length, 1);
});

test('should_recover_from_a_corrupt_index_using_the_backup_written_by_the_previous_capture', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v2'), false);
	// The second capture's writeIndex should have backed up the index as it
	// stood after the first capture (one version) before overwriting it.
	writeFileSync(join(storeRoot, bucketId, 'index.json'), '{ not valid json');

	const versions = listVersions(storeRoot, folder, 'series-1');

	assert.equal(versions.length, 1);
	assert.equal(versions[0].sizeBytes, Buffer.from('v1').byteLength);
});

test('should_treat_index_as_empty_when_both_primary_and_backup_are_corrupt', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	writeFileSync(join(storeRoot, bucketId, 'index.json'), '{ not valid json');
	writeFileSync(join(storeRoot, bucketId, 'index.json.bak'), '{ also not valid');

	const seriesId = findActiveSeriesId(storeRoot, folder, 'notas.md');

	assert.equal(seriesId, undefined);
});

test('should_reject_reading_a_snapshot_whose_blob_content_does_not_match_its_recorded_hash', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	const version = captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('conteúdo original'), false);
	const blobPath = join(storeRoot, bucketId, 'blobs', `${version.contentHash}.blob`);
	writeFileSync(blobPath, 'conteúdo adulterado');

	assert.throws(() => readSnapshotContent(storeRoot, folder, version), /corrupted/);
});

test('should_store_a_new_blob_gzip_compressed_on_disk', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	const version = captureSnapshot(
		storeRoot,
		folder,
		'series-1',
		'notas.md',
		Buffer.from('conteúdo repetitivo '.repeat(50)),
		false,
	);
	const blobPath = join(storeRoot, bucketId, 'blobs', `${version.contentHash}.blob`);
	const raw = readFileSync(blobPath);

	assert.equal(raw[0], 0x1f);
	assert.equal(raw[1], 0x8b);
});

test('should_read_back_exact_content_from_a_legacy_uncompressed_blob', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	const version = captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('conteúdo original'), false);
	const blobPath = join(storeRoot, bucketId, 'blobs', `${version.contentHash}.blob`);
	// Simulate a blob written by a pre-Fase-4 backtrail version (raw, no gzip).
	writeFileSync(blobPath, 'conteúdo original');

	const content = readSnapshotContent(storeRoot, folder, version);

	assert.equal(content.toString('utf8'), 'conteúdo original');
});

test('should_reject_a_gzipped_blob_whose_decompressed_content_does_not_match_its_recorded_hash', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	const version = captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('conteúdo original'), false);
	const blobPath = join(storeRoot, bucketId, 'blobs', `${version.contentHash}.blob`);
	writeFileSync(blobPath, gzipSync(Buffer.from('conteúdo adulterado')));

	assert.throws(() => readSnapshotContent(storeRoot, folder, version), /corrupted/);
});

test('should_delete_the_whole_bucket_for_a_tracked_folder', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	deleteBucket(storeRoot, folder);

	assert.equal(findActiveSeriesId(storeRoot, folder, 'notas.md'), undefined);
	assert.equal(existsSync(join(storeRoot, bucketIdFor(folder))), false);
});

test('should_be_a_no_op_deleting_a_bucket_that_was_never_created', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	assert.doesNotThrow(() => deleteBucket(storeRoot, folder));
});

test('should_restrict_bucket_and_blob_permissions_after_hardening_a_legacy_bucket', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	const version = captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	const bucketPath = join(storeRoot, bucketId);
	const blobPath = join(bucketPath, 'blobs', `${version.contentHash}.blob`);
	// Simulate a bucket created by a pre-hardening version of backtrail.
	chmodSync(bucketPath, 0o755);
	chmodSync(blobPath, 0o644);

	hardenBucketPermissions(storeRoot, folder);

	// fs's mode bits are POSIX-only — on Windows they don't reflect a real
	// access-control decision (see the Windows ACL test below for that).
	if (process.platform !== 'win32') {
		assert.equal(statSync(bucketPath).mode & 0o777, 0o700);
		assert.equal(statSync(blobPath).mode & 0o777, 0o600);
	}
});

test('restricts a new bucket to the current user only on Windows', { skip: process.platform !== 'win32' }, (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);

	const bucketPath = join(storeRoot, bucketId);
	const output = execFileSync('icacls', [bucketPath]).toString();

	// /inheritance:r + /grant:r replace every inherited and explicit ACE
	// with just the current user — the default Everyone/Users grants a
	// fresh directory gets from its parent must not survive that.
	assert.ok(!output.includes('Everyone'), `expected no Everyone ACE, got:\n${output}`);
	assert.ok(!/BUILTIN\\Users/i.test(output), `expected no BUILTIN\\Users ACE, got:\n${output}`);
});

test('should_skip_a_bucket_that_was_already_hardened_instead_of_re_sweeping_it', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	hardenBucketPermissions(storeRoot, folder);
	const markerPath = join(storeRoot, bucketId, '.permissions-hardened');
	const mtimeAfterFirstSweep = statSync(markerPath).mtimeMs;

	hardenBucketPermissions(storeRoot, folder);

	assert.equal(statSync(markerPath).mtimeMs, mtimeAfterFirstSweep);
});

test('should_be_a_no_op_hardening_a_bucket_that_was_never_created', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');

	assert.doesNotThrow(() => hardenBucketPermissions(storeRoot, folder));
});

test('should_write_the_index_without_pretty_printing_indentation', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	const raw = readFileSync(join(storeRoot, bucketId, 'index.json'), 'utf8');

	assert.equal(raw.includes('\n'), false);
});

test('should_pick_up_an_index_written_by_another_window_instead_of_a_stale_in_memory_copy', (t) => {
	const storeRoot = makeTempDir(t, 'backtrail-store-');
	const folder = makeTempDir(t, 'backtrail-folder-');
	const bucketId = bucketIdFor(folder);

	captureSnapshot(storeRoot, folder, 'series-1', 'notas.md', Buffer.from('v1'), false);
	// Warm this process's in-memory cache for the bucket.
	assert.equal(listVersions(storeRoot, folder, 'series-1').length, 1);

	// Simulate a second VS Code window writing the same bucket's index
	// directly (bypassing this process's writeIndex/cache entirely).
	const indexPath = join(storeRoot, bucketId, 'index.json');
	const externallyWritten = {
		series: {
			'series-1': [
				{ relPath: 'notas.md', timestamp: new Date().toISOString(), sizeBytes: 2, isBinary: false, contentHash: 'x' },
				{ relPath: 'notas.md', timestamp: new Date().toISOString(), sizeBytes: 2, isBinary: false, contentHash: 'y' },
			],
		},
	};
	writeFileSync(indexPath, JSON.stringify(externallyWritten));

	assert.equal(listVersions(storeRoot, folder, 'series-1').length, 2);
});
