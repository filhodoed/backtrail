import * as vscode from 'vscode';
import { DEFAULT_CAPTURE_DEBOUNCE_SECONDS } from './fileWatcher';
import { DEFAULT_IGNORED_FILES, DEFAULT_IGNORED_FOLDERS, type IgnoreConfig } from './ignoreFilters';
import { DEFAULT_MAX_VERSIONS_PER_SERIES } from './snapshotStore';

const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_RETENTION_DAYS = 45;

export function getIgnoreConfig(): IgnoreConfig {
	const config = vscode.workspace.getConfiguration('backtrail');
	return {
		ignoredFolders: config.get<string[]>('ignoredFolders', DEFAULT_IGNORED_FOLDERS),
		ignoredFiles: config.get<string[]>('ignoredFiles', DEFAULT_IGNORED_FILES),
		ignoredExtensions: config.get<string[]>('ignoredExtensions', []),
		maxFileSizeBytes: config.get<number>('maxFileSizeMB', DEFAULT_MAX_FILE_SIZE_MB) * 1024 * 1024,
	};
}

export function getRetentionDays(): number {
	return vscode.workspace.getConfiguration('backtrail').get<number>('retentionDays', DEFAULT_RETENTION_DAYS);
}

export function getMaxVersionsPerSeries(): number {
	return vscode.workspace
		.getConfiguration('backtrail')
		.get<number>('maxVersionsPerSeries', DEFAULT_MAX_VERSIONS_PER_SERIES);
}

export function getCaptureDebounceSeconds(): number {
	return vscode.workspace
		.getConfiguration('backtrail')
		.get<number>('captureDebounceSeconds', DEFAULT_CAPTURE_DEBOUNCE_SECONDS);
}
