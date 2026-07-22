import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	DEFAULT_IGNORED_FOLDERS,
	DEFAULT_MAX_FILE_SIZE_BYTES,
	shouldIgnore,
	type IgnoreConfig,
} from '../../src/ignoreFilters.ts';

const baseConfig: IgnoreConfig = {
	ignoredFolders: DEFAULT_IGNORED_FOLDERS,
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
