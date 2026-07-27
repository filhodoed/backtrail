import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	DEFAULT_IGNORED_FILES,
	DEFAULT_IGNORED_FOLDERS,
	DEFAULT_MAX_FILE_SIZE_BYTES,
	shouldIgnore,
	type IgnoreConfig,
} from '../../src/ignoreFilters.ts';

const baseConfig: IgnoreConfig = {
	ignoredFolders: DEFAULT_IGNORED_FOLDERS,
	ignoredFiles: DEFAULT_IGNORED_FILES,
	ignoredExtensions: ['.log', '.tmp'],
	maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
};

test('should_ignore_file_inside_default_ignored_folder', () => {
	const result = shouldIgnore('node_modules/left-pad/index.js', 100, baseConfig);

	assert.equal(result, true);
});

test('should_ignore_file_nested_deep_inside_ignored_folder', () => {
	const result = shouldIgnore('a/b/node_modules/c/d/index.js', 100, baseConfig);

	assert.equal(result, true);
});

test('should_not_ignore_file_outside_ignored_folders', () => {
	const result = shouldIgnore('src/extension.ts', 100, baseConfig);

	assert.equal(result, false);
});

test('should_not_ignore_folder_whose_name_only_partially_matches', () => {
	const result = shouldIgnore('node_modules_backup/file.js', 100, baseConfig);

	assert.equal(result, false);
});

test('should_ignore_file_with_ignored_extension', () => {
	const result = shouldIgnore('logs/server.log', 100, baseConfig);

	assert.equal(result, true);
});

test('should_match_extension_case_insensitively', () => {
	const result = shouldIgnore('logs/SERVER.LOG', 100, baseConfig);

	assert.equal(result, true);
});

test('should_not_ignore_file_with_non_ignored_extension', () => {
	const result = shouldIgnore('notes.md', 100, baseConfig);

	assert.equal(result, false);
});

test('should_not_treat_dotfile_as_having_an_extension', () => {
	const result = shouldIgnore('.gitignore', 100, baseConfig);

	assert.equal(result, false);
});

test('should_ignore_file_above_max_size', () => {
	const result = shouldIgnore('video.mp4', DEFAULT_MAX_FILE_SIZE_BYTES + 1, baseConfig);

	assert.equal(result, true);
});

test('should_not_ignore_file_at_exactly_max_size', () => {
	const result = shouldIgnore('video.mp4', DEFAULT_MAX_FILE_SIZE_BYTES, baseConfig);

	assert.equal(result, false);
});

test('should_handle_windows_style_path_separators', () => {
	const result = shouldIgnore('node_modules\\left-pad\\index.js', 100, baseConfig);

	assert.equal(result, true);
});

test('should_ignore_a_dotfile_with_no_extension_that_is_on_the_ignored_files_list', () => {
	const result = shouldIgnore('.env', 100, baseConfig);

	assert.equal(result, true);
});

test('should_ignore_an_ignored_file_nested_inside_a_subfolder', () => {
	const result = shouldIgnore('config/nested/.env', 100, baseConfig);

	assert.equal(result, true);
});

test('should_not_ignore_a_file_whose_name_only_partially_matches_an_ignored_file', () => {
	const result = shouldIgnore('.env.production', 100, baseConfig);

	assert.equal(result, false);
});

test('should_ignore_file_inside_a_restored_folder_by_default', () => {
	const result = shouldIgnore('restored/notas.restored-2026-07-26-1200.md', 100, baseConfig);

	assert.equal(result, true);
});

test('should_ignore_a_file_directly_matching_an_excluded_path_prefix', () => {
	const result = shouldIgnore('cache/notas.md', 100, { ...baseConfig, excludedPathPrefixes: ['cache'] });

	assert.equal(result, true);
});

test('should_ignore_a_file_nested_deep_inside_an_excluded_path_prefix', () => {
	const result = shouldIgnore('cache/nested/deep/notas.md', 100, { ...baseConfig, excludedPathPrefixes: ['cache'] });

	assert.equal(result, true);
});

test('should_not_ignore_a_file_whose_folder_only_partially_matches_an_excluded_path_prefix', () => {
	const result = shouldIgnore('cache-backup/notas.md', 100, { ...baseConfig, excludedPathPrefixes: ['cache'] });

	assert.equal(result, false);
});

test('should_not_ignore_a_file_outside_any_excluded_path_prefix', () => {
	const result = shouldIgnore('src/notas.md', 100, { ...baseConfig, excludedPathPrefixes: ['cache', 'dist/old'] });

	assert.equal(result, false);
});

test('should_ignore_a_file_matching_one_of_several_excluded_path_prefixes', () => {
	const result = shouldIgnore('dist/old/build.js', 100, { ...baseConfig, excludedPathPrefixes: ['cache', 'dist/old'] });

	assert.equal(result, true);
});

test('should_not_ignore_by_excluded_path_prefix_when_none_are_configured', () => {
	const result = shouldIgnore('anything/notas.md', 100, baseConfig);

	assert.equal(result, false);
});
