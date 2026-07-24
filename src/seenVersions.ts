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

export interface SeenEntry {
	seriesId: string;
	latestTimestamp: string;
}

// markSeen persists by rewriting the whole seen-versions map through
// globalState.update() — fine for one file, but "mark all as seen" on a
// large tracked folder used to call it once per active file, sequentially:
// the same read-whole-blob/write-whole-blob-per-item cost that used to make
// baseline capture crawl, just on globalState instead of the store's own
// index.json. This reads the map once, applies every entry, writes once.
export async function markManySeen(store: KeyValueStore, entries: readonly SeenEntry[]): Promise<void> {
	if (entries.length === 0) {
		return;
	}
	const map = readSeenMap(store);
	for (const { seriesId, latestTimestamp } of entries) {
		map[seriesId] = latestTimestamp;
	}
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
