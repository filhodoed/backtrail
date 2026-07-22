import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canShowDiff } from '../../src/diffEligibility.ts';

test('should_allow_diff_for_text_version', () => {
	const result = canShowDiff({ isBinary: false, relPath: 'notas.md' });

	assert.equal(result, true);
});

test('should_allow_diff_for_image_extension_even_though_binary', () => {
	const result = canShowDiff({ isBinary: true, relPath: 'foto.png' });

	assert.equal(result, true);
});

test('should_not_allow_diff_for_non_image_binary', () => {
	const result = canShowDiff({ isBinary: true, relPath: 'relatorio.pptx' });

	assert.equal(result, false);
});

test('should_match_image_extension_case_insensitively', () => {
	const result = canShowDiff({ isBinary: true, relPath: 'foto.PNG' });

	assert.equal(result, true);
});
