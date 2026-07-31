import { execFileSync } from 'node:child_process';
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
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const HARDENED_MARKER_NAME = '.permissions-hardened';

// chmod's mode bits are POSIX-only — on Windows, fs's `mode` option only
// toggles the read-only attribute, it doesn't restrict which other accounts
// on the machine can read the file. icacls ships with Windows since Vista,
// so this needs no new dependency. `(OI)(CI)` (object-inherit/container-
// inherit) makes anything created under `path` afterwards inherit the same
// ACL automatically — matches how DIR_MODE/FILE_MODE only need to be passed
// once per mkdirSync/writeFileSync call, not reapplied per file.
function restrictToOwnerWindows(path: string): void {
	if (process.platform !== 'win32') {
		return;
	}
	try {
		execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(OI)(CI)F`], {
			stdio: 'ignore',
		});
	} catch {
		// Best-effort — a hardened ACL is a bonus, it must not block the write
		// itself (non-NTFS volume, icacls missing, etc).
	}
}

// gzip's magic bytes. Blobs written before Fase 4 (compression) are raw
// content and never start with these — checking them lets readSnapshotContent
// accept both formats with zero migration of existing blobs.
const GZIP_MAGIC_BYTE_0 = 0x1f;
const GZIP_MAGIC_BYTE_1 = 0x8b;

function isGzipped(data: Uint8Array): boolean {
	return data.length >= 2 && data[0] === GZIP_MAGIC_BYTE_0 && data[1] === GZIP_MAGIC_BYTE_1;
}

// Same segment-wise "is this path under that prefix" rule as ignoreFilters.ts's
// pathHasPrefix (not a naive string prefix, so "src-test" doesn't match prefix
// "src") — duplicated rather than imported: this file is loaded directly by
// node --test (see test/unit/snapshotStore.test.ts), whose ESM loader requires
// extensioned specifiers that the project's tsc config (no
// allowImportingTsExtensions outside test/) rejects for a same-package .ts
// import. purgePath and ignoreFilters.shouldIgnore must still agree on what
// "under this path" means — keep the two definitions in sync if either changes.
function isUnderPathPrefix(relPath: string, prefix: string): boolean {
	const splitSegments = (path: string): string[] => path.split(/[\\/]+/).filter(Boolean);
	const pathSegments = splitSegments(relPath);
	const prefixSegments = splitSegments(prefix);
	return (
		prefixSegments.length > 0 &&
		prefixSegments.length <= pathSegments.length &&
		prefixSegments.every((segment, i) => pathSegments[i] === segment)
	);
}

// A series with no version cap grows unbounded for a file saved constantly in
// a single day (a session transcript, a log) — retention by age alone doesn't
// help there, since all those versions are still fresh. This is the backstop
// for that case; the 15s capture debounce (fileWatcher.ts) is the primary
// mitigation and keeps most series well under this anyway.
export const DEFAULT_MAX_VERSIONS_PER_SERIES = 100;

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

function isSnapshotVersion(value: unknown): value is SnapshotVersion {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.relPath === 'string' &&
		typeof candidate.timestamp === 'string' &&
		typeof candidate.sizeBytes === 'number' &&
		typeof candidate.isBinary === 'boolean' &&
		typeof candidate.contentHash === 'string'
	);
}

// A JSON.parse that succeeds is not the same guarantee as a well-formed
// index — {"series": "not an object"} or {"series": {"x": [{"relPath": 1}]}}
// parse just fine but would break every reader downstream (readIndex's
// callers all assume series is a Record<string, SnapshotVersion[]>). Treat
// anything that doesn't match that shape the same way readIndex already
// treats corrupt JSON: fall back to .bak, then to an empty index, rather
// than handing a malformed object to code that never checks its shape again.
export function parseStoreIndex(value: unknown): StoreIndex | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}
	const series = (value as Record<string, unknown>).series;
	if (typeof series !== 'object' || series === null || Array.isArray(series)) {
		return undefined;
	}
	for (const versions of Object.values(series)) {
		if (!Array.isArray(versions) || !versions.every(isSnapshotVersion)) {
			return undefined;
		}
	}
	return value as StoreIndex;
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
		return parseStoreIndex(JSON.parse(readFileSync(path, 'utf8')));
	} catch {
		return undefined;
	}
}

interface FileSignature {
	mtimeMs: number;
	size: number;
}

// mtime alone isn't a fine-enough invalidation key: a write that lands
// within the same mtime tick as the previous one (seen on Windows CI
// runners, where the effective resolution is coarser than macOS/Linux)
// is indistinguishable from no write at all. Pairing it with size costs
// nothing extra — same statSync call — and two writes that both change
// content and happen to keep the exact same byte count are not a
// realistic case here (every write in this file rewrites the whole
// serialized index).
function statSignature(path: string): FileSignature | undefined {
	try {
		const stats = statSync(path);
		return { mtimeMs: stats.mtimeMs, size: stats.size };
	} catch {
		return undefined;
	}
}

function sameSignature(a: FileSignature, b: FileSignature): boolean {
	return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

// Every decoration/history/changes read used to reopen and reparse
// index.json from scratch — with the ~/.claude benchmark corpus that's a
// 768KB JSON.parse per visible file in the Explorer. Caching the parsed
// index per bucket, keyed by the index file's own mtime+size, means a
// bucket is only reparsed once between writes: a second window (or an
// external tool) writing the same index changes that signature, so the
// cache is bypassed rather than trusted stale — no invalidation message
// needed, the filesystem already carries it.
const indexCache = new Map<string, { index: StoreIndex; signature: FileSignature }>();

function readIndex(storeRoot: string, bucketId: string): StoreIndex {
	const path = indexPath(storeRoot, bucketId);
	const signature = statSignature(path);

	const cached = indexCache.get(path);
	if (cached && signature && sameSignature(cached.signature, signature)) {
		return cached.index;
	}

	// A truncated/corrupt index (crash mid-write, two windows racing the same
	// file, disk corruption) must not permanently break this bucket. Fall back
	// to the last known-good snapshot (see writeIndex) before giving up and
	// treating the bucket as empty — losing history to a bit flip is worse
	// than reading a version that's a few writes stale.
	const index = parseIndexFile(path) ?? parseIndexFile(`${path}.bak`) ?? { series: {} };

	if (signature) {
		indexCache.set(path, { index, signature });
	} else {
		indexCache.delete(path);
	}
	return index;
}

// Callers that mutate the index (capture, prune) must never do so on the
// object living in indexCache: if applyCapture/pruneOlderThan touched it in
// place and the subsequent writeIndex then failed (disk full, permissions),
// the cache would show a version that was never actually persisted. A
// shallow copy of the series map decouples the two — cheap even with
// thousands of series, since it's a copy of the top-level keys, not a
// reparse — and the per-series array itself is only copied where it's
// actually touched (see applyCapture).
function readMutableIndex(storeRoot: string, bucketId: string): StoreIndex {
	const index = readIndex(storeRoot, bucketId);
	return { series: { ...index.series } };
}

function writeIndex(storeRoot: string, bucketId: string, index: StoreIndex): void {
	const dir = bucketDir(storeRoot, bucketId);
	// mkdirSync only returns a path (the first segment it created) the first
	// time this directory comes into existence — every later capture's
	// writeIndex sees it already there and gets undefined. Gates the icacls
	// spawn to that first time instead of once per capture.
	if (mkdirSync(dir, { recursive: true, mode: DIR_MODE }) !== undefined) {
		restrictToOwnerWindows(dir);
	}
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
	// No pretty-print: this file is never hand-edited, and indentation was
	// costing real bytes/parse time on large indices for zero benefit.
	writeFileSync(tmpPath, JSON.stringify(index), { encoding: 'utf8', mode: FILE_MODE });
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

	// We just wrote this exact index — cache it against the file's new
	// signature instead of letting the next readIndex reparse what we
	// already have in memory.
	const signature = statSignature(path);
	if (signature) {
		indexCache.set(path, { index, signature });
	}
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
	const existingVersions = index.series[seriesId] ?? [];

	// Save can fire the watcher more than once for a single logical edit (VS
	// Code re-emits on some platforms, a formatter re-saves identical output,
	// etc.). Appending a version whose content is byte-identical to the one
	// already at the top of this series would plant a no-op entry with the
	// same content on both sides of a diff — indistinguishable from "nothing
	// changed" to the user, and it pushes the real previous version one slot
	// further away. Treat it as the same version instead of a new one — but
	// only when relPath also matches: a rename that keeps content unchanged
	// still needs its own entry, since that's the only record of the rename.
	const last = existingVersions[existingVersions.length - 1];
	if (last && last.contentHash === contentHash && last.relPath === relPath) {
		return { version: last, changed: false };
	}

	const blobs = blobsDir(storeRoot, bucketId);
	if (mkdirSync(blobs, { recursive: true, mode: DIR_MODE }) !== undefined) {
		restrictToOwnerWindows(blobs);
	}
	const blobPath = join(blobs, `${contentHash}.blob`);
	if (!existsSync(blobPath)) {
		// contentHash (and sizeBytes below) is always of the original content —
		// compression is a storage detail, never part of the identity or the
		// size shown to the user.
		writeFileSync(blobPath, gzipSync(content), { mode: FILE_MODE });
	}

	const version: SnapshotVersion = {
		relPath,
		timestamp: now.toISOString(),
		sizeBytes: content.byteLength,
		isBinary,
		contentHash,
	};
	// Build a new array rather than pushing onto existingVersions in place —
	// that array may be the same one still referenced by indexCache (see
	// readMutableIndex), and mutating it here would leak this version into
	// the cache before writeIndex has actually persisted it.
	index.series[seriesId] = [...existingVersions, version];
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
	const index = readMutableIndex(storeRoot, bucketId);
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
	const index = readMutableIndex(storeRoot, bucketId);

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
	const raw = readFileSync(join(blobsDir(storeRoot, bucketId), `${version.contentHash}.blob`));
	// Blobs written before Fase 4 are raw (never start with the gzip magic
	// bytes) — reading both formats means existing blobs never need migrating.
	const content = isGzipped(raw) ? gunzipSync(raw) : raw;
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

export interface ActiveSeries {
	seriesId: string;
	versions: SnapshotVersion[];
}

// Every caller that needs "the current state of this specific file" (decoration,
// mark-as-seen, history view) used to redo findActiveSeriesId + listVersions by
// hand — three copies of the same two-call chain. This is that chain, once.
export function getActiveSeries(
	storeRoot: string,
	absoluteFolderPath: string,
	relPath: string,
): ActiveSeries | undefined {
	const seriesId = findActiveSeriesId(storeRoot, absoluteFolderPath, relPath);
	if (!seriesId) {
		return undefined;
	}
	return { seriesId, versions: listVersions(storeRoot, absoluteFolderPath, seriesId) };
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
	maxVersionsPerSeries: number = DEFAULT_MAX_VERSIONS_PER_SERIES,
): number {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readMutableIndex(storeRoot, bucketId);
	const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

	let prunedCount = 0;
	const referencedHashes = new Set<string>();

	for (const seriesId of Object.keys(index.series)) {
		let kept = index.series[seriesId].filter((version) => {
			const isOld = new Date(version.timestamp).getTime() < cutoff;
			if (isOld) {
				prunedCount++;
			}
			return !isOld;
		});

		if (kept.length > maxVersionsPerSeries) {
			prunedCount += kept.length - maxVersionsPerSeries;
			kept = kept.slice(-maxVersionsPerSeries);
		}

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

// Excluding a path (Fase 5, Monitor view / Changes view context menu) only
// stops FUTURE capture on its own — whatever was already saved before the
// path was excluded keeps occupying space forever otherwise. This is the
// other half: retroactively remove the series currently living under that
// path. "Currently living" mirrors the active-series rule used everywhere
// else in this file (findActiveSeriesId, listActiveFiles) — only a series
// whose LAST version's relPath falls under the prefix is purged, so a file
// that used to live under the excluded path but has since been renamed out
// of it keeps its history untouched.
export function purgePath(storeRoot: string, absoluteFolderPath: string, relPathPrefix: string): number {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readMutableIndex(storeRoot, bucketId);

	let purgedCount = 0;
	for (const seriesId of Object.keys(index.series)) {
		const versions = index.series[seriesId];
		const last = versions[versions.length - 1];
		if (last && isUnderPathPrefix(last.relPath, relPathPrefix)) {
			purgedCount += versions.length;
			delete index.series[seriesId];
		}
	}

	// Same orphan-blob GC as pruneOlderThan: a blob only goes away once no
	// remaining series (in or outside the purged path) still references it.
	const referencedHashes = new Set<string>();
	for (const versions of Object.values(index.series)) {
		for (const version of versions) {
			referencedHashes.add(version.contentHash);
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
	return purgedCount;
}

// Untracking a folder (Stop Tracking, or a cancelled baseline scan undoing
// itself) removes it from the tracked-folders list, but without this the
// bucket — index.json and every blob — stayed in globalStorage forever, with
// no path back to it once the folder path was gone from any list. Callers
// decide whether that's acceptable for a given untrack (see
// trackedFoldersCommands.ts and extension.ts's untrackAndForget).
//
// bucketIdFor needs realpathSync to succeed, which needs the folder to still
// exist on disk — exactly the case that's often untrue by the time someone
// wants to stop tracking a folder (deleted, moved, unmounted drive). Callers
// that persisted a bucketId at tracking time (trackedFolders.ts's
// recordBucketId) can pass it as fallbackBucketId so the delete still goes
// through; without one, a folder that's already gone is a silent no-op —
// there's no way to know which bucket was ever its, and throwing here would
// only surface as an unhandled rejection two callers up (both call sites are
// fire-and-forget), not as anything the user could act on.
export function deleteBucket(storeRoot: string, absoluteFolderPath: string, fallbackBucketId?: string): void {
	let bucketId: string;
	try {
		bucketId = bucketIdFor(absoluteFolderPath);
	} catch {
		if (fallbackBucketId === undefined) {
			return;
		}
		bucketId = fallbackBucketId;
	}
	deleteBucketById(storeRoot, bucketId);
}

export function deleteBucketById(storeRoot: string, bucketId: string): void {
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
		// Windows ACL retrofit for legacy buckets deliberately isn't done here:
		// an /T recursive icacls pass over a directory with existing content
		// broke test cleanup in CI (EPERM/ENOENT on Windows) in a way that
		// needs a real Windows machine to diagnose safely, not just a runner
		// log. New buckets/blobs are already protected at write time
		// (writeIndex, applyCapture) — only pre-existing Windows buckets from
		// an older Backtrail version are left unhardened for now.
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
