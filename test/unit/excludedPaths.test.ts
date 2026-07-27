import assert from 'node:assert/strict';
import { test } from 'node:test';
import { excludePath, includePath, listExcludedPaths } from '../../src/excludedPaths.ts';
import type { KeyValueStore } from '../../src/trackedFolders.ts';

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

test('should_list_no_excluded_paths_when_store_is_empty', () => {
	const store = createFakeStore();

	assert.deepEqual(listExcludedPaths(store, '/Users/edsonjunior/notes'), []);
});

test('should_exclude_a_path', async () => {
	const store = createFakeStore();

	await excludePath(store, '/Users/edsonjunior/notes', 'cache');

	assert.deepEqual(listExcludedPaths(store, '/Users/edsonjunior/notes'), ['cache']);
});

test('should_not_duplicate_an_already_excluded_path', async () => {
	const store = createFakeStore();

	await excludePath(store, '/Users/edsonjunior/notes', 'cache');
	await excludePath(store, '/Users/edsonjunior/notes', 'cache');

	assert.deepEqual(listExcludedPaths(store, '/Users/edsonjunior/notes'), ['cache']);
});

test('should_keep_excluded_paths_separate_per_tracked_folder', async () => {
	const store = createFakeStore();

	await excludePath(store, '/Users/edsonjunior/notes', 'cache');
	await excludePath(store, '/Users/edsonjunior/docs', 'drafts');

	assert.deepEqual(listExcludedPaths(store, '/Users/edsonjunior/notes'), ['cache']);
	assert.deepEqual(listExcludedPaths(store, '/Users/edsonjunior/docs'), ['drafts']);
});

test('should_re_include_a_previously_excluded_path', async () => {
	const store = createFakeStore();
	await excludePath(store, '/Users/edsonjunior/notes', 'cache');

	await includePath(store, '/Users/edsonjunior/notes', 'cache');

	assert.deepEqual(listExcludedPaths(store, '/Users/edsonjunior/notes'), []);
});

test('should_be_a_no_op_re_including_a_path_that_was_never_excluded', async () => {
	const store = createFakeStore();
	await excludePath(store, '/Users/edsonjunior/notes', 'cache');

	await includePath(store, '/Users/edsonjunior/notes', 'other');

	assert.deepEqual(listExcludedPaths(store, '/Users/edsonjunior/notes'), ['cache']);
});
