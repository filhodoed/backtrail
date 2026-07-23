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
