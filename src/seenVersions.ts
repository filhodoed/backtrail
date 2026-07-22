import type { KeyValueStore } from './trackedFolders';

const STORAGE_KEY = 'backtrail.seenVersions';

export type DecorationState = 'new' | 'changed' | 'none';

function readSeenMap(store: KeyValueStore): Record<string, string> {
	return store.get<Record<string, string>>(STORAGE_KEY, {});
}

export async function markSeen(store: KeyValueStore, seriesId: string, latestTimestamp: string): Promise<void> {
	const map = readSeenMap(store);
	map[seriesId] = latestTimestamp;
	await store.update(STORAGE_KEY, map);
}

export function getDecorationState(
	store: KeyValueStore,
	seriesId: string,
	latestVersionTimestamp: string,
): DecorationState {
	const lastSeen = readSeenMap(store)[seriesId];
	if (lastSeen === undefined) {
		return 'new';
	}
	if (lastSeen < latestVersionTimestamp) {
		return 'changed';
	}
	return 'none';
}
