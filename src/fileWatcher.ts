import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import * as vscode from 'vscode';
import { isBinaryContent } from './binaryDetector';
import { DEFAULT_IGNORED_FOLDERS, DEFAULT_MAX_FILE_SIZE_BYTES, shouldIgnore, type IgnoreConfig } from './ignoreFilters';
import { findMatchingPendingDeletion, type PendingDeletion } from './renameCorrelation';
import {
	captureSnapshot,
	captureSnapshotsBatch,
	findActiveSeriesId,
	hashContent,
	listActiveFiles,
	listVersions,
	type CaptureInput,
} from './snapshotStore';

const DEFAULT_IGNORE_CONFIG: IgnoreConfig = {
	ignoredFolders: DEFAULT_IGNORED_FOLDERS,
	ignoredExtensions: [],
	maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
};

export const RENAME_CORRELATION_WINDOW_MS = 5000;

// Delete and create events for the same rename aren't guaranteed to arrive in
// order — the create can land before the delete finishes registering as
// pending. This grace period gives a same-content delete a short chance to
// show up before a look-like-new file is finalized under a brand new series.
export const RENAME_GRACE_WINDOW_MS = 500;

interface TrackedPendingDeletion extends PendingDeletion {
	timer: ReturnType<typeof setTimeout>;
}

export function watchTrackedFolder(
	absoluteFolderPath: string,
	storeRoot: string,
	ignoreConfig: IgnoreConfig = DEFAULT_IGNORE_CONFIG,
	onCapture?: (uri: vscode.Uri) => void,
): vscode.Disposable {
	const folderUri = vscode.Uri.file(absoluteFolderPath);
	const pattern = new vscode.RelativePattern(folderUri, '**/*');
	const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

	const pendingDeletions = new Map<string, TrackedPendingDeletion>();
	const pendingCaptureTimers = new Set<ReturnType<typeof setTimeout>>();

	// Watcher callbacks run outside any caller's try/catch — an uncaught throw
	// here (a file removed between the event and the read, an unreachable
	// tracked folder, a corrupt index) crashes the whole extension host, not
	// just this capture. Best-effort: skip this event, keep watching.
	const onCreateOrChange = (uri: vscode.Uri) => {
		try {
			captureIfNotIgnored(
				absoluteFolderPath,
				storeRoot,
				uri,
				ignoreConfig,
				pendingDeletions,
				pendingCaptureTimers,
				onCapture,
			);
		} catch {
			// See comment above.
		}
	};
	const onDelete = (uri: vscode.Uri) => {
		try {
			registerPendingDeletion(absoluteFolderPath, storeRoot, uri, pendingDeletions);
		} catch {
			// See comment above onCreateOrChange.
		}
	};

	const cleanup = new vscode.Disposable(() => {
		for (const { timer } of pendingDeletions.values()) {
			clearTimeout(timer);
		}
		pendingDeletions.clear();
		for (const timer of pendingCaptureTimers) {
			clearTimeout(timer);
		}
		pendingCaptureTimers.clear();
	});

	return vscode.Disposable.from(
		watcher,
		watcher.onDidCreate(onCreateOrChange),
		watcher.onDidChange(onCreateOrChange),
		watcher.onDidDelete(onDelete),
		cleanup,
	);
}

// Chunk size for baseline capture: large enough that the per-chunk index
// read/write (O(chunk) not O(1)) stays a rounding error against a walk of
// hundreds of thousands of files, small enough that memory stays bounded
// (only one chunk's file contents held at once) and the extension host gets
// to breathe between chunks instead of blocking for the whole walk.
const BASELINE_CHUNK_SIZE = 200;

// A file tracked for the first time has no earlier Backtrail snapshot to diff
// its first real edit against — there is no way to reconstruct content that
// predates tracking. Capturing the on-disk state as a baseline the moment a
// folder is tracked gives that first edit a genuine predecessor to diff
// against, instead of an empty-vs-whole-file comparison.
//
// This used to walk the tree synchronously, one file at a time, rereading
// and rewriting the whole index per file — on a large tracked folder (a home
// directory, say) that blocked the extension host for minutes with no way
// to cancel, forcing a VS Code restart. It now works in chunks, yields to
// the event loop between chunks, and writes the index once per chunk
// instead of once per file — see captureSnapshotsBatch.
export async function captureBaselineSnapshots(
	absoluteFolderPath: string,
	storeRoot: string,
	ignoreConfig: IgnoreConfig = DEFAULT_IGNORE_CONFIG,
	token?: { isCancellationRequested: boolean },
): Promise<void> {
	// Cheap pre-filter so files already captured by an earlier (possibly
	// cancelled) baseline run, or by a real edit racing ahead of this scan,
	// don't get needlessly read and hashed just to be discarded later.
	// captureSnapshotsBatch re-checks at write time regardless, so this is an
	// optimization, not the correctness gate.
	const alreadyTracked = new Set(listActiveFiles(storeRoot, absoluteFolderPath).map((file) => file.relPath));

	let chunk: CaptureInput[] = [];

	for (const absolutePath of walkFiles(absoluteFolderPath, ignoreConfig.ignoredFolders)) {
		if (token?.isCancellationRequested) {
			break;
		}

		const relPath = relative(absoluteFolderPath, absolutePath);
		if (alreadyTracked.has(relPath)) {
			continue;
		}

		let sizeBytes: number;
		try {
			sizeBytes = statSync(absolutePath).size;
		} catch {
			continue;
		}
		if (shouldIgnore(relPath, sizeBytes, ignoreConfig)) {
			continue;
		}

		let content: Buffer;
		try {
			content = readFileSync(absolutePath);
		} catch {
			continue;
		}
		chunk.push({ seriesId: randomUUID(), relPath, content, isBinary: isBinaryContent(content) });

		if (chunk.length >= BASELINE_CHUNK_SIZE) {
			captureSnapshotsBatch(storeRoot, absoluteFolderPath, chunk);
			chunk = [];
			await new Promise((resolve) => setImmediate(resolve));
		}
	}

	if (chunk.length > 0) {
		captureSnapshotsBatch(storeRoot, absoluteFolderPath, chunk);
	}
}

function* walkFiles(dir: string, ignoredFolders: string[]): Generator<string> {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!ignoredFolders.includes(entry.name)) {
				yield* walkFiles(fullPath, ignoredFolders);
			}
		} else if (entry.isFile()) {
			yield fullPath;
		}
	}
}

function registerPendingDeletion(
	absoluteFolderPath: string,
	storeRoot: string,
	uri: vscode.Uri,
	pendingDeletions: Map<string, TrackedPendingDeletion>,
): void {
	const relPath = relative(absoluteFolderPath, uri.fsPath);
	const seriesId = findActiveSeriesId(storeRoot, absoluteFolderPath, relPath);
	if (!seriesId) {
		return;
	}

	const versions = listVersions(storeRoot, absoluteFolderPath, seriesId);
	const lastVersion = versions[versions.length - 1];
	if (!lastVersion) {
		return;
	}

	const timer = setTimeout(() => pendingDeletions.delete(relPath), RENAME_CORRELATION_WINDOW_MS);
	pendingDeletions.set(relPath, { seriesId, relPath, contentHash: lastVersion.contentHash, timer });
}

function consumeMatchingPendingDeletion(
	pendingDeletions: Map<string, TrackedPendingDeletion>,
	contentHash: string,
): PendingDeletion | undefined {
	const match = findMatchingPendingDeletion(pendingDeletions, contentHash);
	if (!match) {
		return undefined;
	}
	const tracked = pendingDeletions.get(match.relPath);
	if (tracked) {
		clearTimeout(tracked.timer);
	}
	pendingDeletions.delete(match.relPath);
	return match;
}

function captureIfNotIgnored(
	absoluteFolderPath: string,
	storeRoot: string,
	uri: vscode.Uri,
	ignoreConfig: IgnoreConfig,
	pendingDeletions: Map<string, TrackedPendingDeletion>,
	pendingCaptureTimers: Set<ReturnType<typeof setTimeout>>,
	onCapture?: (uri: vscode.Uri) => void,
): void {
	const relPath = relative(absoluteFolderPath, uri.fsPath);

	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(uri.fsPath);
	} catch {
		return;
	}
	if (stats.isDirectory()) {
		return;
	}
	const sizeBytes = stats.size;

	if (shouldIgnore(relPath, sizeBytes, ignoreConfig)) {
		return;
	}

	const content = readFileSync(uri.fsPath);
	const isBinary = isBinaryContent(content);
	const contentHash = hashContent(content);

	const existingSeriesId = findActiveSeriesId(storeRoot, absoluteFolderPath, relPath);
	if (existingSeriesId) {
		captureSnapshot(storeRoot, absoluteFolderPath, existingSeriesId, relPath, content, isBinary);
		onCapture?.(uri);
		return;
	}

	const immediateMatch = consumeMatchingPendingDeletion(pendingDeletions, contentHash);
	if (immediateMatch) {
		captureSnapshot(storeRoot, absoluteFolderPath, immediateMatch.seriesId, relPath, content, isBinary);
		onCapture?.(uri);
		return;
	}

	const graceTimer = setTimeout(() => {
		pendingCaptureTimers.delete(graceTimer);
		const delayedMatch = consumeMatchingPendingDeletion(pendingDeletions, contentHash);
		const seriesId = delayedMatch ? delayedMatch.seriesId : randomUUID();
		captureSnapshot(storeRoot, absoluteFolderPath, seriesId, relPath, content, isBinary);
		onCapture?.(uri);
	}, RENAME_GRACE_WINDOW_MS);
	pendingCaptureTimers.add(graceTimer);
}
