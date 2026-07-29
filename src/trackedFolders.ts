import { isAbsolute, relative, sep } from 'node:path';

export interface KeyValueStore {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: unknown): PromiseLike<void>;
}

export interface ResolvedTrackedFolder {
	folder: string;
	relPath: string;
}

const STORAGE_KEY = 'backtrail.trackedFolders';

export function listTrackedFolders(store: KeyValueStore): string[] {
	// Defensive: every consumer (tree items, decorations, the watcher) does a
	// path operation on each entry, and one bad value would take all of them
	// down at once — filter it out here instead of guarding every call site.
	return store
		.get<string[]>(STORAGE_KEY, [])
		.filter((folder): folder is string => typeof folder === 'string' && folder.length > 0);
}

export function isTracked(store: KeyValueStore, absoluteFolderPath: string): boolean {
	return listTrackedFolders(store).includes(absoluteFolderPath);
}

export async function trackFolder(store: KeyValueStore, absoluteFolderPath: string): Promise<void> {
	const folders = listTrackedFolders(store);
	if (!folders.includes(absoluteFolderPath)) {
		await store.update(STORAGE_KEY, [...folders, absoluteFolderPath]);
	}
}

export async function untrackFolder(store: KeyValueStore, absoluteFolderPath: string): Promise<void> {
	const folders = listTrackedFolders(store);
	await store.update(
		STORAGE_KEY,
		folders.filter((folder) => folder !== absoluteFolderPath),
	);
}

const BUCKET_ID_STORAGE_KEY = 'backtrail.bucketIds';

// snapshotStore's bucketId is normally just sha256(realpathSync(folder)),
// recomputed on every access — cheap while the folder exists, but it means
// every store operation (including deleting a folder's history on untrack)
// depends on the folder still being reachable on disk. Persisting the id
// here, once, at tracking time, gives deleteBucket a fallback for the one
// moment that dependency actually bites: the folder was already deleted,
// moved, or unmounted by the time the user asks to stop tracking it.
export function getBucketId(store: KeyValueStore, absoluteFolderPath: string): string | undefined {
	return store.get<Record<string, string>>(BUCKET_ID_STORAGE_KEY, {})[absoluteFolderPath];
}

export async function recordBucketId(
	store: KeyValueStore,
	absoluteFolderPath: string,
	bucketId: string,
): Promise<void> {
	const map = store.get<Record<string, string>>(BUCKET_ID_STORAGE_KEY, {});
	await store.update(BUCKET_ID_STORAGE_KEY, { ...map, [absoluteFolderPath]: bucketId });
}

export async function forgetBucketId(store: KeyValueStore, absoluteFolderPath: string): Promise<void> {
	const map = store.get<Record<string, string>>(BUCKET_ID_STORAGE_KEY, {});
	if (!(absoluteFolderPath in map)) {
		return;
	}
	const { [absoluteFolderPath]: _removed, ...rest } = map;
	await store.update(BUCKET_ID_STORAGE_KEY, rest);
}

export function resolveTrackedFolder(
	folders: readonly string[],
	targetPath: string,
): ResolvedTrackedFolder | undefined {
	for (const folder of folders) {
		const relPath = relative(folder, targetPath);
		const isOutside = relPath === '..' || relPath.startsWith(`..${sep}`) || isAbsolute(relPath);
		if (!isOutside) {
			return { folder, relPath };
		}
	}
	return undefined;
}
