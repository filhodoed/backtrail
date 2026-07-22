export interface PendingDeletion {
	seriesId: string;
	relPath: string;
	contentHash: string;
}

export function findMatchingPendingDeletion(
	pending: ReadonlyMap<string, PendingDeletion>,
	contentHash: string,
): PendingDeletion | undefined {
	for (const deletion of pending.values()) {
		if (deletion.contentHash === contentHash) {
			return deletion;
		}
	}
	return undefined;
}
