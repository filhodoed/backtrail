import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logCaptureWarning, type WarningSink } from '../../src/outputChannel.ts';

function fakeSink(): { sink: WarningSink; lines: string[] } {
	const lines: string[] = [];
	return { sink: { appendLine: (value: string) => lines.push(value) }, lines };
}

test('should_append_a_line_containing_the_context_and_error_message', () => {
	const { sink, lines } = fakeSink();

	logCaptureWarning(sink, 'ctx-basic', new Error('disco cheio'));

	assert.equal(lines.length, 1);
	assert.match(lines[0], /ctx-basic/);
	assert.match(lines[0], /disco cheio/);
});

test('should_stringify_a_non_error_thrown_value', () => {
	const { sink, lines } = fakeSink();

	logCaptureWarning(sink, 'ctx-non-error', 'plain string failure');

	assert.match(lines[0], /plain string failure/);
});

test('should_append_metadata_as_key_value_pairs', () => {
	const { sink, lines } = fakeSink();

	logCaptureWarning(sink, 'ctx-metadata', new Error('falhou'), { relPath: 'notas.md' });

	assert.match(lines[0], /relPath=notas\.md/);
});

test('should_suppress_a_second_warning_for_the_same_context_within_the_throttle_window', () => {
	const { sink, lines } = fakeSink();

	logCaptureWarning(sink, 'ctx-throttle-same', new Error('primeira'));
	logCaptureWarning(sink, 'ctx-throttle-same', new Error('segunda, deveria ser suprimida'));

	assert.equal(lines.length, 1);
	assert.match(lines[0], /primeira/);
});

test('should_not_throttle_across_different_contexts', () => {
	const { sink, lines } = fakeSink();

	logCaptureWarning(sink, 'ctx-a', new Error('erro A'));
	logCaptureWarning(sink, 'ctx-b', new Error('erro B'));

	assert.equal(lines.length, 2);
});
