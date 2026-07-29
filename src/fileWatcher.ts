import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import * as vscode from 'vscode';
import { isBinaryContent } from './binaryDetector';
import {
	DEFAULT_IGNORED_FILES,
	DEFAULT_IGNORED_FOLDERS,
	DEFAULT_MAX_FILE_SIZE_BYTES,
	shouldIgnore,
	type IgnoreConfig,
} from './ignoreFilters';
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
	ignoredFiles: DEFAULT_IGNORED_FILES,
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

// Content read at onDidChange/onDidCreate time and held until the debounce
// timer decides to persist it (or a delete/rename flushes it early — see
// registerPendingDeletion). Keeping the bytes here means the timer never
// needs to re-read the file, so a delete/rename that lands before the
// debounce window elapses can't silently drop the edit the way re-reading
// from a now-missing path would.
interface PendingCapture {
	timer: ReturnType<typeof setTimeout>;
	content: Buffer;
}

export type WarningHandler = (context: string, error: unknown, metadata?: Record<string, string>) => void;

export function watchTrackedFolder(
	absoluteFolderPath: string,
	storeRoot: string,
	ignoreConfig: IgnoreConfig = DEFAULT_IGNORE_CONFIG,
	onCapture?: (uri: vscode.Uri) => void,
	captureDebounceSeconds: number = DEFAULT_CAPTURE_DEBOUNCE_SECONDS,
	onWarning?: WarningHandler,
): vscode.Disposable {
	const folderUri = vscode.Uri.file(absoluteFolderPath);
	const pattern = new vscode.RelativePattern(folderUri, '**/*');
	const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

	const pendingDeletions = new Map<string, TrackedPendingDeletion>();
	const pendingCaptureTimers = new Set<ReturnType<typeof setTimeout>>();
	const captureDebounceTimers = new Map<string, PendingCapture>();
	const captureDebounceMs = captureDebounceSeconds * 1000;

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
				captureDebounceTimers,
				captureDebounceMs,
				onCapture,
			);
		} catch (error) {
			onWarning?.('onCreateOrChange', error);
		}
	};
	const onDelete = (uri: vscode.Uri) => {
		try {
			registerPendingDeletion(
				absoluteFolderPath,
				storeRoot,
				uri,
				pendingDeletions,
				captureDebounceTimers,
				onCapture,
				onWarning,
			);
		} catch (error) {
			onWarning?.('onDelete', error);
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
		for (const { timer } of captureDebounceTimers.values()) {
			clearTimeout(timer);
		}
		captureDebounceTimers.clear();
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
// hundreds of thousands of files, small enough that the extension host gets
// to breathe between chunks instead of blocking for the whole walk. This
// alone doesn't bound memory — a folder full of large files (each up to
// maxFileSizeBytes, 50MB by default) could hold 200 of them at once, tens of
// GB in the worst case — so BASELINE_CHUNK_MAX_BYTES below is the actual
// memory cap; whichever threshold is hit first flushes the chunk.
const BASELINE_CHUNK_MAX_FILES = 200;
const BASELINE_CHUNK_MAX_BYTES = 32 * 1024 * 1024;

// A tracked file saved repeatedly in quick succession (an actively-appended
// log, a session transcript, an autosave loop) used to plant one version per
// save — for an append-only file, dedup never collapses any of it, since each
// save's content differs from the last. Collapsing consecutive saves into a
// single capture once the file goes quiet caps that growth at its source,
// before retention or the per-series cap (see pruneOlderThan) ever see it.
export const DEFAULT_CAPTURE_DEBOUNCE_SECONDS = 15;

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
	let chunkBytes = 0;

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
		chunkBytes += content.byteLength;

		if (chunk.length >= BASELINE_CHUNK_MAX_FILES || chunkBytes >= BASELINE_CHUNK_MAX_BYTES) {
			captureSnapshotsBatch(storeRoot, absoluteFolderPath, chunk);
			chunk = [];
			chunkBytes = 0;
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
	captureDebounceTimers: Map<string, PendingCapture>,
	onCapture?: (uri: vscode.Uri) => void,
	onWarning?: WarningHandler,
): void {
	const relPath = relative(absoluteFolderPath, uri.fsPath);
	const seriesId = findActiveSeriesId(storeRoot, absoluteFolderPath, relPath);
	if (!seriesId) {
		return;
	}

	// A save still debouncing when this delete/rename fired was already read
	// into memory (see scheduleDebouncedCapture) but not yet persisted.
	// Flush it now so lastVersion below — and this pending deletion's
	// contentHash — reflect the file's real final content. Without this, a
	// rename that lands mid-debounce wouldn't correlate: the create side
	// reads the post-rename bytes, but this delete side would still be
	// comparing against the pre-edit hash still sitting in the index.
	const pendingCapture = captureDebounceTimers.get(relPath);
	if (pendingCapture) {
		clearTimeout(pendingCapture.timer);
		captureDebounceTimers.delete(relPath);
		try {
			captureSnapshot(
				storeRoot,
				absoluteFolderPath,
				seriesId,
				relPath,
				pendingCapture.content,
				isBinaryContent(pendingCapture.content),
			);
			onCapture?.(uri);
		} catch (error) {
			// Same best-effort rationale as scheduleDebouncedCapture's own timer
			// below — a write failure here must not crash the extension host.
			onWarning?.('registerPendingDeletion (flush)', error, { relPath });
		}
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

// A file already on an active series has no rename ambiguity left to resolve
// — that only matters for the create/pending-deletion match below, the first
// time a relPath joins a series. Repeat saves of an already-tracked file are
// pure captures, so this is where consecutive saves collapse: rescheduling
// the same relPath's timer on every event, and only actually reading +
// capturing once the file has been quiet for captureDebounceMs.
function scheduleDebouncedCapture(
	storeRoot: string,
	absoluteFolderPath: string,
	seriesId: string,
	relPath: string,
	uri: vscode.Uri,
	content: Buffer,
	captureDebounceTimers: Map<string, PendingCapture>,
	captureDebounceMs: number,
	onCapture?: (uri: vscode.Uri) => void,
	onWarning?: WarningHandler,
): void {
	const existing = captureDebounceTimers.get(relPath);
	if (existing) {
		clearTimeout(existing.timer);
	}

	const timer = setTimeout(() => {
		captureDebounceTimers.delete(relPath);
		try {
			captureSnapshot(storeRoot, absoluteFolderPath, seriesId, relPath, content, isBinaryContent(content));
			onCapture?.(uri);
		} catch (error) {
			// This timer fires after the sync handler that scheduled it already
			// returned, so it's outside that handler's try/catch — an uncaught
			// throw here (disk full, permission denied) would crash the extension
			// host same as an uncaught throw in the sync path. Best-effort: skip.
			onWarning?.('scheduleDebouncedCapture', error, { relPath });
		}
	}, captureDebounceMs);
	captureDebounceTimers.set(relPath, { timer, content });
}

function captureIfNotIgnored(
	absoluteFolderPath: string,
	storeRoot: string,
	uri: vscode.Uri,
	ignoreConfig: IgnoreConfig,
	pendingDeletions: Map<string, TrackedPendingDeletion>,
	pendingCaptureTimers: Set<ReturnType<typeof setTimeout>>,
	captureDebounceTimers: Map<string, PendingCapture>,
	captureDebounceMs: number,
	onCapture?: (uri: vscode.Uri) => void,
	onWarning?: WarningHandler,
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

	const existingSeriesId = findActiveSeriesId(storeRoot, absoluteFolderPath, relPath);
	if (existingSeriesId) {
		// Read now, not when the debounce timer fires — a delete/rename that
		// lands before the timer elapses must not lose this content to a
		// re-read against a path that's no longer there (see scheduleDebouncedCapture).
		scheduleDebouncedCapture(
			storeRoot,
			absoluteFolderPath,
			existingSeriesId,
			relPath,
			uri,
			readFileSync(uri.fsPath),
			captureDebounceTimers,
			captureDebounceMs,
			onCapture,
			onWarning,
		);
		return;
	}

	const content = readFileSync(uri.fsPath);
	const isBinary = isBinaryContent(content);
	const contentHash = hashContent(content);

	const immediateMatch = consumeMatchingPendingDeletion(pendingDeletions, contentHash);
	if (immediateMatch) {
		captureSnapshot(storeRoot, absoluteFolderPath, immediateMatch.seriesId, relPath, content, isBinary);
		onCapture?.(uri);
		return;
	}

	const graceTimer = setTimeout(() => {
		pendingCaptureTimers.delete(graceTimer);
		try {
			const delayedMatch = consumeMatchingPendingDeletion(pendingDeletions, contentHash);
			const seriesId = delayedMatch ? delayedMatch.seriesId : randomUUID();
			captureSnapshot(storeRoot, absoluteFolderPath, seriesId, relPath, content, isBinary);
			onCapture?.(uri);
		} catch (error) {
			// See comment in scheduleDebouncedCapture's timer above — this also
			// runs after the sync handler returned, outside its try/catch.
			onWarning?.('captureIfNotIgnored (grace timer)', error, { relPath });
		}
	}, RENAME_GRACE_WINDOW_MS);
	pendingCaptureTimers.add(graceTimer);
}
