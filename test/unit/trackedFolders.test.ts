import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	isTracked,
	listTrackedFolders,
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

	assert.deepEqual(result, { folder: '/Users/edsonjunior/notes', relPath: 'docs/a.md' });
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
