export interface PendingDeletion {
	seriesId: string;
	relPath: string;
	contentHash: string;
}

export function findMatchingPendingDeletion(
	pending: ReadonlyMap<string, PendingDeletion>,
	contentHash: string,
): PendingDeletion | undefined {
	// A real rename fires delete-then-create back to back, so the true
	// partner is the most recently deleted match — not whichever pending
	// deletion happens to be oldest. Map iteration is insertion order, so the
	// last match seen is the most recent.
	let match: PendingDeletion | undefined;
	for (const deletion of pending.values()) {
		if (deletion.contentHash === contentHash) {
			match = deletion;
		}
	}
	return match;
}
