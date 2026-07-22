import assert from 'node:assert/strict';
import { getIgnoreConfig, getRetentionDays } from '../config';
import { DEFAULT_IGNORED_FOLDERS } from '../ignoreFilters';

suite('Config Integration', () => {
	test('resolves default ignore config when no user setting is present', () => {
		const config = getIgnoreConfig();

		assert.deepEqual(config.ignoredFolders, DEFAULT_IGNORED_FOLDERS);
		assert.deepEqual(config.ignoredExtensions, []);
		assert.equal(config.maxFileSizeBytes, 50 * 1024 * 1024);
	});

	test('resolves default retention days when no user setting is present', () => {
		assert.equal(getRetentionDays(), 45);
	});
});
