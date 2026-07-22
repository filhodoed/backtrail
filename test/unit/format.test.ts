import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBytes } from '../../src/format.ts';

test('should_format_bytes_under_1kb_as_is', () => {
	assert.equal(formatBytes(512), '512 B');
});

test('should_format_kilobytes_with_one_decimal', () => {
	assert.equal(formatBytes(1536), '1.5 KB');
});

test('should_format_megabytes_with_one_decimal', () => {
	assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
});
