import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDecorationState, markManySeen, markSeen } from '../../src/seenVersions.ts';
import type { KeyValueStore } from '../../src/trackedFolders.ts';

function createFakeStore(): KeyValueStore & { updateCount: number } {
	const data = new Map<string, unknown>();
	return {
		updateCount: 0,
		get<T>(key: string, defaultValue: T): T {
			return data.has(key) ? (data.get(key) as T) : defaultValue;
		},
		update(this: { updateCount: number }, key: string, value: unknown): PromiseLike<void> {
			this.updateCount++;
			data.set(key, value);
			return Promise.resolve();
		},
	};
}

test('should_report_new_when_series_was_never_seen', () => {
	const store = createFakeStore();

	const state = getDecorationState(store, 'series-1', '2026-07-20T10:00:00.000Z');

	assert.equal(state, 'new');
});

test('should_stay_new_across_multiple_unseen_versions', () => {
	const store = createFakeStore();

	const state = getDecorationState(store, 'series-1', '2026-07-20T12:00:00.000Z');

	assert.equal(state, 'new');
});

test('should_report_none_right_after_marking_seen', async () => {
	const store = createFakeStore();
	await markSeen(store, 'series-1', '2026-07-20T10:00:00.000Z');

	const state = getDecorationState(store, 'series-1', '2026-07-20T10:00:00.000Z');

	assert.equal(state, 'none');
});

test('should_report_changed_when_a_newer_version_exists_after_being_seen', async () => {
	const store = createFakeStore();
	await markSeen(store, 'series-1', '2026-07-20T10:00:00.000Z');

	const state = getDecorationState(store, 'series-1', '2026-07-20T11:00:00.000Z');

	assert.equal(state, 'changed');
});

test('should_report_new_again_only_after_reset_not_just_reseen', async () => {
	const store = createFakeStore();
	await markSeen(store, 'series-1', '2026-07-20T10:00:00.000Z');
	await markSeen(store, 'series-1', '2026-07-20T11:00:00.000Z');

	const state = getDecorationState(store, 'series-1', '2026-07-20T11:00:00.000Z');

	assert.equal(state, 'none');
});

test('should_track_independent_series_separately', async () => {
	const store = createFakeStore();
	await markSeen(store, 'series-1', '2026-07-20T10:00:00.000Z');

	const stateSeries1 = getDecorationState(store, 'series-1', '2026-07-20T10:00:00.000Z');
	const stateSeries2 = getDecorationState(store, 'series-2', '2026-07-20T10:00:00.000Z');

	assert.equal(stateSeries1, 'none');
	assert.equal(stateSeries2, 'new');
});

test('should_write_the_store_only_once_for_a_whole_batch', async () => {
	const store = createFakeStore();

	await markManySeen(store, [
		{ seriesId: 'series-1', latestTimestamp: '2026-07-20T10:00:00.000Z' },
		{ seriesId: 'series-2', latestTimestamp: '2026-07-20T10:00:00.000Z' },
		{ seriesId: 'series-3', latestTimestamp: '2026-07-20T10:00:00.000Z' },
	]);

	assert.equal(store.updateCount, 1);
	assert.equal(getDecorationState(store, 'series-1', '2026-07-20T10:00:00.000Z'), 'none');
	assert.equal(getDecorationState(store, 'series-2', '2026-07-20T10:00:00.000Z'), 'none');
	assert.equal(getDecorationState(store, 'series-3', '2026-07-20T10:00:00.000Z'), 'none');
});

test('should_be_a_no_op_for_an_empty_batch', async () => {
	const store = createFakeStore();

	await markManySeen(store, []);

	assert.equal(store.updateCount, 0);
});
