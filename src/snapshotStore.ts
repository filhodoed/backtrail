import { createHash } from 'node:crypto';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const HARDENED_MARKER_NAME = '.permissions-hardened';

export interface SnapshotVersion {
	relPath: string;
	timestamp: string;
	sizeBytes: number;
	isBinary: boolean;
	contentHash: string;
}

interface StoreIndex {
	series: Record<string, SnapshotVersion[]>;
}

export function hashContent(data: string | Uint8Array): string {
	return createHash('sha256').update(data).digest('hex');
}

export function bucketIdFor(absoluteFolderPath: string): string {
	return hashContent(realpathSync(absoluteFolderPath));
}

function bucketDir(storeRoot: string, bucketId: string): string {
	return join(storeRoot, bucketId);
}

function indexPath(storeRoot: string, bucketId: string): string {
	return join(bucketDir(storeRoot, bucketId), 'index.json');
}

function blobsDir(storeRoot: string, bucketId: string): string {
	return join(bucketDir(storeRoot, bucketId), 'blobs');
}

function parseIndexFile(path: string): StoreIndex | undefined {
	if (!existsSync(path)) {
		return undefined;
	}
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as StoreIndex;
	} catch {
		return undefined;
	}
}

function readIndex(storeRoot: string, bucketId: string): StoreIndex {
	const path = indexPath(storeRoot, bucketId);
	const primary = parseIndexFile(path);
	if (primary) {
		return primary;
	}
	// A truncated/corrupt index (crash mid-write, two windows racing the same
	// file, disk corruption) must not permanently break this bucket. Fall back
	// to the last known-good snapshot (see writeIndex) before giving up and
	// treating the bucket as empty — losing history to a bit flip is worse
	// than reading a version that's a few writes stale.
	const backup = parseIndexFile(`${path}.bak`);
	if (backup) {
		return backup;
	}
	return { series: {} };
}

function writeIndex(storeRoot: string, bucketId: string, index: StoreIndex): void {
	const dir = bucketDir(storeRoot, bucketId);
	mkdirSync(dir, { recursive: true, mode: DIR_MODE });
	const path = indexPath(storeRoot, bucketId);
	const tmpPath = `${path}.tmp`;
	const backupPath = `${path}.bak`;

	// Write-to-temp-then-rename makes the on-disk index.json immune to
	// mid-write crashes: a crash while serializing content only ever corrupts
	// the .tmp file, and POSIX rename() is atomic within the same directory —
	// readers never observe a half-written index. Snapshotting the previous
	// valid index to .bak before the rename gives readIndex a known-good
	// fallback for the other corruption path (bit rot, an external tool
	// touching the file) that atomic rename alone doesn't cover.
	writeFileSync(tmpPath, JSON.stringify(index, null, 2), { encoding: 'utf8', mode: FILE_MODE });
	if (existsSync(path)) {
		copyFileSync(path, backupPath);
		try {
			chmodSync(backupPath, FILE_MODE);
		} catch {
			// Best-effort — a chmod failure on the backup must not block the
			// write itself.
		}
	}
	renameSync(tmpPath, path);
}

export interface CaptureInput {
	seriesId: string;
	relPath: string;
	content: Uint8Array;
	isBinary: boolean;
}

interface ApplyCaptureResult {
	version: SnapshotVersion;
	changed: boolean;
}

function applyCapture(
	storeRoot: string,
	bucketId: string,
	index: StoreIndex,
	input: CaptureInput,
	now: Date,
): ApplyCaptureResult {
	const { seriesId, relPath, content, isBinary } = input;
	const contentHash = hashContent(content);
	const versions = index.series[seriesId] ?? [];

	// Save can fire the watcher more than once for a single logical edit (VS
	// Code re-emits on some platforms, a formatter re-saves identical output,
	// etc.). Appending a version whose content is byte-identical to the one
	// already at the top of this series would plant a no-op entry with the
	// same content on both sides of a diff — indistinguishable from "nothing
	// changed" to the user, and it pushes the real previous version one slot
	// further away. Treat it as the same version instead of a new one — but
	// only when relPath also matches: a rename that keeps content unchanged
	// still needs its own entry, since that's the only record of the rename.
	const last = versions[versions.length - 1];
	if (last && last.contentHash === contentHash && last.relPath === relPath) {
		return { version: last, changed: false };
	}

	mkdirSync(blobsDir(storeRoot, bucketId), { recursive: true, mode: DIR_MODE });
	const blobPath = join(blobsDir(storeRoot, bucketId), `${contentHash}.blob`);
	if (!existsSync(blobPath)) {
		writeFileSync(blobPath, content, { mode: FILE_MODE });
	}

	const version: SnapshotVersion = {
		relPath,
		timestamp: now.toISOString(),
		sizeBytes: content.byteLength,
		isBinary,
		contentHash,
	};
	versions.push(version);
	index.series[seriesId] = versions;
	return { version, changed: true };
}

export function captureSnapshot(
	storeRoot: string,
	absoluteFolderPath: string,
	seriesId: string,
	relPath: string,
	content: Uint8Array,
	isBinary: boolean,
	now: Date = new Date(),
): SnapshotVersion {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readIndex(storeRoot, bucketId);
	const { version, changed } = applyCapture(storeRoot, bucketId, index, { seriesId, relPath, content, isBinary }, now);
	if (changed) {
		writeIndex(storeRoot, bucketId, index);
	}
	return version;
}

// Baseline scans need to snapshot many files (potentially every file in a
// large tracked folder) without rereading and rewriting the whole index once
// per file — that turns an O(n) walk into O(n) full-index-rewrites, which is
// what froze the extension host on large tracked folders. This reads the
// index once, skips any relPath that already has an active series (a real
// edit may have captured it for real while this batch was still building —
// that capture wins, the baseline entry is redundant), and writes once.
export function captureSnapshotsBatch(
	storeRoot: string,
	absoluteFolderPath: string,
	entries: readonly CaptureInput[],
	now: Date = new Date(),
): void {
	if (entries.length === 0) {
		return;
	}
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readIndex(storeRoot, bucketId);

	const activeRelPaths = new Set<string>();
	for (const versions of Object.values(index.series)) {
		const last = versions[versions.length - 1];
		if (last) {
			activeRelPaths.add(last.relPath);
		}
	}

	for (const entry of entries) {
		if (activeRelPaths.has(entry.relPath)) {
			continue;
		}
		applyCapture(storeRoot, bucketId, index, entry, now);
		activeRelPaths.add(entry.relPath);
	}

	writeIndex(storeRoot, bucketId, index);
}

export function listVersions(storeRoot: string, absoluteFolderPath: string, seriesId: string): SnapshotVersion[] {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readIndex(storeRoot, bucketId);
	return index.series[seriesId] ?? [];
}

export function readSnapshotContent(storeRoot: string, absoluteFolderPath: string, version: SnapshotVersion): Buffer {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const content = readFileSync(join(blobsDir(storeRoot, bucketId), `${version.contentHash}.blob`));
	if (hashContent(content) !== version.contentHash) {
		// The index says this blob is version.contentHash but the bytes on disk
		// hash to something else — silent corruption (disk error, a hand-edited
		// blob, a name collision that shouldn't be possible with sha256). Surface
		// it instead of quietly handing back wrong content to a diff or restore.
		throw new Error(`backtrail: stored snapshot for "${version.relPath}" is corrupted (content hash mismatch)`);
	}
	return content;
}

export function findActiveSeriesId(storeRoot: string, absoluteFolderPath: string, relPath: string): string | undefined {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readIndex(storeRoot, bucketId);
	for (const [seriesId, versions] of Object.entries(index.series)) {
		const last = versions[versions.length - 1];
		if (last && last.relPath === relPath) {
			return seriesId;
		}
	}
	return undefined;
}

export interface ActiveFile {
	relPath: string;
	seriesId: string;
	lastVersion: SnapshotVersion;
}

export function listActiveFiles(storeRoot: string, absoluteFolderPath: string): ActiveFile[] {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readIndex(storeRoot, bucketId);

	// Same "first match wins" rule as findActiveSeriesId: a relPath can only
	// be current for one series at a time, so the first series found whose
	// last entry has that relPath is the one that's actually live.
	const byRelPath = new Map<string, ActiveFile>();
	for (const [seriesId, versions] of Object.entries(index.series)) {
		const lastVersion = versions[versions.length - 1];
		if (lastVersion && !byRelPath.has(lastVersion.relPath)) {
			byRelPath.set(lastVersion.relPath, { relPath: lastVersion.relPath, seriesId, lastVersion });
		}
	}
	return [...byRelPath.values()];
}

export function pruneOlderThan(
	storeRoot: string,
	absoluteFolderPath: string,
	maxAgeDays: number,
	now: Date = new Date(),
): number {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readIndex(storeRoot, bucketId);
	const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

	let prunedCount = 0;
	const referencedHashes = new Set<string>();

	for (const seriesId of Object.keys(index.series)) {
		const kept = index.series[seriesId].filter((version) => {
			const isOld = new Date(version.timestamp).getTime() < cutoff;
			if (isOld) {
				prunedCount++;
			}
			return !isOld;
		});

		if (kept.length === 0) {
			delete index.series[seriesId];
		} else {
			index.series[seriesId] = kept;
			for (const version of kept) {
				referencedHashes.add(version.contentHash);
			}
		}
	}

	const blobs = blobsDir(storeRoot, bucketId);
	if (existsSync(blobs)) {
		for (const file of readdirSync(blobs)) {
			const contentHash = file.replace(/\.blob$/, '');
			if (!referencedHashes.has(contentHash)) {
				rmSync(join(blobs, file));
			}
		}
	}

	writeIndex(storeRoot, bucketId, index);
	return prunedCount;
}

// Untracking a folder (Stop Tracking, or a cancelled baseline scan undoing
// itself) removes it from the tracked-folders list, but without this the
// bucket — index.json and every blob — stayed in globalStorage forever, with
// no path back to it once the folder path was gone from any list. Callers
// decide whether that's acceptable for a given untrack (see
// trackedFoldersCommands.ts and extension.ts's untrackAndForget).
export function deleteBucket(storeRoot: string, absoluteFolderPath: string): void {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const dir = bucketDir(storeRoot, bucketId);
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

// Buckets created before permission hardening shipped (or copied in from an
// older backtrail version) still have their index/blobs at the previous
// default mode (0644/0755) — world-readable on a shared machine. This brings
// an existing bucket up to 0600/0700 once, marked by a sentinel file so a
// large corpus (thousands of blobs) doesn't get re-chmod'd on every single
// activation — new writes already land hardened via writeIndex/applyCapture.
export function hardenBucketPermissions(storeRoot: string, absoluteFolderPath: string): void {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const dir = bucketDir(storeRoot, bucketId);
	if (!existsSync(dir)) {
		return;
	}
	const marker = join(dir, HARDENED_MARKER_NAME);
	if (existsSync(marker)) {
		return;
	}

	try {
		chmodSync(dir, DIR_MODE);
		const idx = indexPath(storeRoot, bucketId);
		if (existsSync(idx)) {
			chmodSync(idx, FILE_MODE);
		}
		const bak = `${idx}.bak`;
		if (existsSync(bak)) {
			chmodSync(bak, FILE_MODE);
		}
		const blobs = blobsDir(storeRoot, bucketId);
		if (existsSync(blobs)) {
			chmodSync(blobs, DIR_MODE);
			for (const file of readdirSync(blobs)) {
				chmodSync(join(blobs, file), FILE_MODE);
			}
		}
		writeFileSync(marker, '', { mode: FILE_MODE });
	} catch {
		// Best-effort: a permissions sweep that fails partway (read-only
		// filesystem, a file removed mid-sweep) must not block activation —
		// it retries on the next activation since the marker was never written.
	}
}
