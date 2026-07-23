import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

function readIndex(storeRoot: string, bucketId: string): StoreIndex {
	const path = indexPath(storeRoot, bucketId);
	if (!existsSync(path)) {
		return { series: {} };
	}
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as StoreIndex;
	} catch {
		// A truncated/corrupt index (crash mid-write, two windows racing the
		// same file) must not permanently break this bucket — treat it like a
		// missing index. The next write replaces it with a fresh, valid one.
		return { series: {} };
	}
}

function writeIndex(storeRoot: string, bucketId: string, index: StoreIndex): void {
	mkdirSync(bucketDir(storeRoot, bucketId), { recursive: true });
	writeFileSync(indexPath(storeRoot, bucketId), JSON.stringify(index, null, 2), 'utf8');
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
	const contentHash = hashContent(content);

	const index = readIndex(storeRoot, bucketId);
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
		return last;
	}

	mkdirSync(blobsDir(storeRoot, bucketId), { recursive: true });
	const blobPath = join(blobsDir(storeRoot, bucketId), `${contentHash}.blob`);
	if (!existsSync(blobPath)) {
		writeFileSync(blobPath, content);
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
	writeIndex(storeRoot, bucketId, index);

	return version;
}

export function listVersions(storeRoot: string, absoluteFolderPath: string, seriesId: string): SnapshotVersion[] {
	const bucketId = bucketIdFor(absoluteFolderPath);
	const index = readIndex(storeRoot, bucketId);
	return index.series[seriesId] ?? [];
}

export function readSnapshotContent(storeRoot: string, absoluteFolderPath: string, version: SnapshotVersion): Buffer {
	const bucketId = bucketIdFor(absoluteFolderPath);
	return readFileSync(join(blobsDir(storeRoot, bucketId), `${version.contentHash}.blob`));
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
