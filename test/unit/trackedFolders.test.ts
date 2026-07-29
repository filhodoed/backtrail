import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
	forgetBucketId,
	getBucketId,
	isTracked,
	listTrackedFolders,
	recordBucketId,
	resolveTrackedFolder,
	trackFolder,
	untrackFolder,
	type KeyValueStore,
} from '../../src/trackedFolders.ts';

function createFakeStore(): KeyValueStore {
	const data = new Map<string, unknown>();
	return {
		get<T>(key: string, defaultValue: T): T {
			return data.has(key) ? (data.get(key) as T) : defaultValue;
		},
		update(key: string, value: unknown): PromiseLike<void> {
			data.set(key, value);
			return Promise.resolve();
		},
	};
}

test('should_list_no_folders_when_store_is_empty', () => {
	const store = createFakeStore();

	assert.deepEqual(listTrackedFolders(store), []);
});

test('should_filter_out_corrupt_non_string_entries_instead_of_surfacing_them', async () => {
	const store = createFakeStore();
	await store.update('backtrail.trackedFolders', ['/tmp/valid', undefined, null, '', 42]);

	assert.deepEqual(listTrackedFolders(store), ['/tmp/valid']);
});

test('should_track_a_folder', async () => {
	const store = createFakeStore();

	await trackFolder(store, '/Users/edsonjunior/notes');

	assert.deepEqual(listTrackedFolders(store), ['/Users/edsonjunior/notes']);
});

test('should_not_duplicate_folder_when_tracked_twice', async () => {
	const store = createFakeStore();

	await trackFolder(store, '/Users/edsonjunior/notes');
	await trackFolder(store, '/Users/edsonjunior/notes');

	assert.deepEqual(listTrackedFolders(store), ['/Users/edsonjunior/notes']);
});

test('should_track_multiple_distinct_folders', async () => {
	const store = createFakeStore();

	await trackFolder(store, '/Users/edsonjunior/notes');
	await trackFolder(store, '/Users/edsonjunior/docs');

	assert.deepEqual(listTrackedFolders(store), ['/Users/edsonjunior/notes', '/Users/edsonjunior/docs']);
});

test('should_report_is_tracked_true_for_tracked_folder', async () => {
	const store = createFakeStore();
	await trackFolder(store, '/Users/edsonjunior/notes');

	assert.equal(isTracked(store, '/Users/edsonjunior/notes'), true);
});

test('should_report_is_tracked_false_for_untracked_folder', () => {
	const store = createFakeStore();

	assert.equal(isTracked(store, '/Users/edsonjunior/notes'), false);
});

test('should_untrack_a_folder', async () => {
	const store = createFakeStore();
	await trackFolder(store, '/Users/edsonjunior/notes');

	await untrackFolder(store, '/Users/edsonjunior/notes');

	assert.deepEqual(listTrackedFolders(store), []);
});

test('should_be_a_no_op_untracking_a_folder_that_was_never_tracked', async () => {
	const store = createFakeStore();
	await trackFolder(store, '/Users/edsonjunior/notes');

	await untrackFolder(store, '/Users/edsonjunior/other');

	assert.deepEqual(listTrackedFolders(store), ['/Users/edsonjunior/notes']);
});

test('should_resolve_tracked_folder_for_file_directly_inside', () => {
	const result = resolveTrackedFolder(['/Users/edsonjunior/notes'], '/Users/edsonjunior/notes/a.md');

	assert.deepEqual(result, { folder: '/Users/edsonjunior/notes', relPath: 'a.md' });
});

test('should_resolve_tracked_folder_for_file_in_subdirectory', () => {
	const result = resolveTrackedFolder(['/Users/edsonjunior/notes'], '/Users/edsonjunior/notes/docs/a.md');

	assert.deepEqual(result, { folder: '/Users/edsonjunior/notes', relPath: join('docs', 'a.md') });
});

test('should_return_undefined_for_file_outside_any_tracked_folder', () => {
	const result = resolveTrackedFolder(['/Users/edsonjunior/notes'], '/Users/edsonjunior/other/a.md');

	assert.equal(result, undefined);
});

test('should_not_match_sibling_folder_with_similar_name_prefix', () => {
	const result = resolveTrackedFolder(['/Users/edsonjunior/notes'], '/Users/edsonjunior/notes-backup/a.md');

	assert.equal(result, undefined);
});

test('should_pick_first_matching_folder_when_multiple_are_tracked', () => {
	const result = resolveTrackedFolder(
		['/Users/edsonjunior/docs', '/Users/edsonjunior/notes'],
		'/Users/edsonjunior/notes/a.md',
	);

	assert.deepEqual(result, { folder: '/Users/edsonjunior/notes', relPath: 'a.md' });
});

test('should_return_undefined_for_a_folder_with_no_recorded_bucket_id', () => {
	const store = createFakeStore();

	assert.equal(getBucketId(store, '/Users/edsonjunior/notes'), undefined);
});

test('should_record_and_retrieve_a_bucket_id_for_a_folder', async () => {
	const store = createFakeStore();

	await recordBucketId(store, '/Users/edsonjunior/notes', 'bucket-abc');

	assert.equal(getBucketId(store, '/Users/edsonjunior/notes'), 'bucket-abc');
});

test('should_record_bucket_ids_for_multiple_folders_independently', async () => {
	const store = createFakeStore();

	await recordBucketId(store, '/Users/edsonjunior/notes', 'bucket-notes');
	await recordBucketId(store, '/Users/edsonjunior/docs', 'bucket-docs');

	assert.equal(getBucketId(store, '/Users/edsonjunior/notes'), 'bucket-notes');
	assert.equal(getBucketId(store, '/Users/edsonjunior/docs'), 'bucket-docs');
});

test('should_overwrite_a_previously_recorded_bucket_id_for_the_same_folder', async () => {
	const store = createFakeStore();

	await recordBucketId(store, '/Users/edsonjunior/notes', 'bucket-old');
	await recordBucketId(store, '/Users/edsonjunior/notes', 'bucket-new');

	assert.equal(getBucketId(store, '/Users/edsonjunior/notes'), 'bucket-new');
});

test('should_forget_a_recorded_bucket_id', async () => {
	const store = createFakeStore();
	await recordBucketId(store, '/Users/edsonjunior/notes', 'bucket-abc');

	await forgetBucketId(store, '/Users/edsonjunior/notes');

	assert.equal(getBucketId(store, '/Users/edsonjunior/notes'), undefined);
});

test('should_forget_one_bucket_id_without_disturbing_another_folders_entry', async () => {
	const store = createFakeStore();
	await recordBucketId(store, '/Users/edsonjunior/notes', 'bucket-notes');
	await recordBucketId(store, '/Users/edsonjunior/docs', 'bucket-docs');

	await forgetBucketId(store, '/Users/edsonjunior/notes');

	assert.equal(getBucketId(store, '/Users/edsonjunior/notes'), undefined);
	assert.equal(getBucketId(store, '/Users/edsonjunior/docs'), 'bucket-docs');
});

test('should_be_a_no_op_forgetting_a_bucket_id_that_was_never_recorded', async () => {
	const store = createFakeStore();

	await assert.doesNotReject(forgetBucketId(store, '/Users/edsonjunior/notes'));
});
