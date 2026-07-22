export interface KeyValueStore {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: unknown): PromiseLike<void>;
}

const STORAGE_KEY = 'backtrail.trackedFolders';

export function listTrackedFolders(store: KeyValueStore): string[] {
	return store.get<string[]>(STORAGE_KEY, []);
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
