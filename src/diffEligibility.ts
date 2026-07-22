import { extname } from 'node:path';
import type { SnapshotVersion } from './snapshotStore';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);

export function canShowDiff(version: Pick<SnapshotVersion, 'isBinary' | 'relPath'>): boolean {
	if (!version.isBinary) {
		return true;
	}
	return IMAGE_EXTENSIONS.has(extname(version.relPath).toLowerCase());
}
