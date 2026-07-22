import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findMatchingPendingDeletion, type PendingDeletion } from '../../src/renameCorrelation.ts';

test('should_return_undefined_when_no_pending_deletions', () => {
	const pending = new Map<string, PendingDeletion>();

	const result = findMatchingPendingDeletion(pending, 'abc123');

	assert.equal(result, undefined);
});

test('should_return_undefined_when_no_hash_matches', () => {
	const pending = new Map<string, PendingDeletion>([
		['notas.md', { seriesId: 'series-1', relPath: 'notas.md', contentHash: 'aaa' }],
	]);

	const result = findMatchingPendingDeletion(pending, 'zzz');

	assert.equal(result, undefined);
});

test('should_return_the_matching_pending_deletion_by_hash', () => {
	const pending = new Map<string, PendingDeletion>([
		['notas.md', { seriesId: 'series-1', relPath: 'notas.md', contentHash: 'aaa' }],
		['outro.md', { seriesId: 'series-2', relPath: 'outro.md', contentHash: 'bbb' }],
	]);

	const result = findMatchingPendingDeletion(pending, 'bbb');

	assert.deepEqual(result, { seriesId: 'series-2', relPath: 'outro.md', contentHash: 'bbb' });
});

test('should_return_first_match_when_multiple_pending_deletions_share_the_same_hash', () => {
	const pending = new Map<string, PendingDeletion>([
		['a.md', { seriesId: 'series-a', relPath: 'a.md', contentHash: 'same' }],
		['b.md', { seriesId: 'series-b', relPath: 'b.md', contentHash: 'same' }],
	]);

	const result = findMatchingPendingDeletion(pending, 'same');

	assert.equal(result?.seriesId, 'series-a');
});
