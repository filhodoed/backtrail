import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINARY_DETECTION_SAMPLE_SIZE, isBinaryContent } from '../../src/binaryDetector.ts';

test('should_detect_empty_content_as_text', () => {
	const result = isBinaryContent(new Uint8Array(0));

	assert.equal(result, false);
});

test('should_detect_plain_ascii_text_as_text', () => {
	const result = isBinaryContent(Buffer.from('hello world', 'utf8'));

	assert.equal(result, false);
});

test('should_detect_utf8_accented_text_as_text', () => {
	const result = isBinaryContent(Buffer.from('não é git, é uma trilha contínua', 'utf8'));

	assert.equal(result, false);
});

test('should_detect_content_with_null_byte_as_binary', () => {
	const content = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

	const result = isBinaryContent(content);

	assert.equal(result, true);
});

test('should_ignore_null_byte_beyond_sample_size', () => {
	const content = Buffer.alloc(BINARY_DETECTION_SAMPLE_SIZE + 1, 'a');
	content[BINARY_DETECTION_SAMPLE_SIZE] = 0;

	const result = isBinaryContent(content);

	assert.equal(result, false);
});

test('should_detect_null_byte_at_last_position_of_sample', () => {
	const content = Buffer.alloc(BINARY_DETECTION_SAMPLE_SIZE, 'a');
	content[BINARY_DETECTION_SAMPLE_SIZE - 1] = 0;

	const result = isBinaryContent(content);

	assert.equal(result, true);
});
