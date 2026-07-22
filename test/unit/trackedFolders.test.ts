import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTracked, listTrackedFolders, trackFolder, untrackFolder, type KeyValueStore } from '../../src/trackedFolders.ts';

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
