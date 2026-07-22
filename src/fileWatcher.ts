import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import * as vscode from 'vscode';
import { isBinaryContent } from './binaryDetector';
import { DEFAULT_IGNORED_FOLDERS, DEFAULT_MAX_FILE_SIZE_BYTES, shouldIgnore, type IgnoreConfig } from './ignoreFilters';
import { captureSnapshot, findActiveSeriesId } from './snapshotStore';

const DEFAULT_IGNORE_CONFIG: IgnoreConfig = {
	ignoredFolders: DEFAULT_IGNORED_FOLDERS,
	ignoredExtensions: [],
	maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
};

export function watchTrackedFolder(
	absoluteFolderPath: string,
	storeRoot: string,
	ignoreConfig: IgnoreConfig = DEFAULT_IGNORE_CONFIG,
): vscode.Disposable {
	const folderUri = vscode.Uri.file(absoluteFolderPath);
	const pattern = new vscode.RelativePattern(folderUri, '**/*');
	const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, true);

	const onEvent = (uri: vscode.Uri) => captureIfNotIgnored(absoluteFolderPath, storeRoot, uri, ignoreConfig);

	return vscode.Disposable.from(watcher, watcher.onDidCreate(onEvent), watcher.onDidChange(onEvent));
}

function captureIfNotIgnored(
	absoluteFolderPath: string,
	storeRoot: string,
	uri: vscode.Uri,
	ignoreConfig: IgnoreConfig,
): void {
	const relPath = relative(absoluteFolderPath, uri.fsPath);

	let sizeBytes: number;
	try {
		sizeBytes = statSync(uri.fsPath).size;
	} catch {
		return;
	}

	if (shouldIgnore(relPath, sizeBytes, ignoreConfig)) {
		return;
	}

	const content = readFileSync(uri.fsPath);
	const isBinary = isBinaryContent(content);
	const seriesId = findActiveSeriesId(storeRoot, absoluteFolderPath, relPath) ?? randomUUID();

	captureSnapshot(storeRoot, absoluteFolderPath, seriesId, relPath, content, isBinary);
}
