import type { KeyValueStore } from './trackedFolders';

const STORAGE_KEY = 'backtrail.excludedPaths';

type ExcludedPathsByFolder = Record<string, string[]>;

function readMap(store: KeyValueStore): ExcludedPathsByFolder {
	return store.get<ExcludedPathsByFolder>(STORAGE_KEY, {});
}

export function listExcludedPaths(store: KeyValueStore, folder: string): string[] {
	return readMap(store)[folder] ?? [];
}

export async function excludePath(store: KeyValueStore, folder: string, relPath: string): Promise<void> {
	const map = readMap(store);
	const existing = map[folder] ?? [];
	if (existing.includes(relPath)) {
		return;
	}
	await store.update(STORAGE_KEY, { ...map, [folder]: [...existing, relPath] });
}

export async function includePath(store: KeyValueStore, folder: string, relPath: string): Promise<void> {
	const map = readMap(store);
	const existing = map[folder] ?? [];
	const next = existing.filter((path) => path !== relPath);
	if (next.length === existing.length) {
		return;
	}
	await store.update(STORAGE_KEY, { ...map, [folder]: next });
}
