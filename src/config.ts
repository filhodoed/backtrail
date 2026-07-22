import * as vscode from 'vscode';
import { DEFAULT_IGNORED_FOLDERS, type IgnoreConfig } from './ignoreFilters';

const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_RETENTION_DAYS = 45;

export function getIgnoreConfig(): IgnoreConfig {
	const config = vscode.workspace.getConfiguration('backtrail');
	return {
		ignoredFolders: config.get<string[]>('ignoredFolders', DEFAULT_IGNORED_FOLDERS),
		ignoredExtensions: config.get<string[]>('ignoredExtensions', []),
		maxFileSizeBytes: config.get<number>('maxFileSizeMB', DEFAULT_MAX_FILE_SIZE_MB) * 1024 * 1024,
	};
}

export function getRetentionDays(): number {
	return vscode.workspace.getConfiguration('backtrail').get<number>('retentionDays', DEFAULT_RETENTION_DAYS);
}
