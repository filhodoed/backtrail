export interface IgnoreConfig {
	ignoredFolders: string[];
	ignoredFiles: string[];
	ignoredExtensions: string[];
	maxFileSizeBytes: number;
	// Per-tracked-folder relative path prefixes excluded via the Monitor view
	// or the Changes view context menu (Fase 5) — distinct from ignoredFolders
	// above, which matches a folder NAME at any depth. Optional so existing
	// config literals (settings-derived, folder-agnostic) don't all need
	// updating for a feature that doesn't apply to them.
	excludedPathPrefixes?: string[];
}

export const DEFAULT_IGNORED_FOLDERS = ['node_modules', '.git', 'dist', 'build', 'restored'];

// Dotfiles like `.env` have no extension by extensionOf's own rule (a leading
// dot isn't a real extension separator — see below), so the extension filter
// can never catch them. These are the common local-secret filenames that
// land in a tracked folder without the user ever meaning to version them.
export const DEFAULT_IGNORED_FILES = ['.env', '.env.local', 'id_rsa', 'id_ed25519', '.npmrc', '.netrc'];
export const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export function splitPathSegments(relPath: string): string[] {
	return relPath.split(/[\\/]+/).filter(Boolean);
}

// True when relPath is prefix itself, or lives anywhere under it — segment-
// wise, not a naive string prefix (so "src-test" doesn't match prefix "src").
// Shared with snapshotStore.ts's purgePath, which needs the exact same
// definition of "under this path" for retroactive deletion to match what
// shouldIgnore stops capturing going forward.
export function pathHasPrefix(relPath: string, prefix: string): boolean {
	const pathSegments = splitPathSegments(relPath);
	const prefixSegments = splitPathSegments(prefix);
	return (
		prefixSegments.length > 0 &&
		prefixSegments.length <= pathSegments.length &&
		prefixSegments.every((segment, i) => pathSegments[i] === segment)
	);
}

function extensionOf(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	if (lastDot <= 0) {
		return '';
	}
	return fileName.slice(lastDot).toLowerCase();
}

export function shouldIgnore(relPath: string, sizeBytes: number, config: IgnoreConfig): boolean {
	if (sizeBytes > config.maxFileSizeBytes) {
		return true;
	}

	const segments = splitPathSegments(relPath);
	const ignoredFolders = new Set(config.ignoredFolders);
	if (segments.slice(0, -1).some((segment) => ignoredFolders.has(segment))) {
		return true;
	}

	if (config.excludedPathPrefixes?.some((prefix) => pathHasPrefix(relPath, prefix))) {
		return true;
	}

	const fileName = segments[segments.length - 1] ?? '';
	const ignoredFiles = new Set(config.ignoredFiles);
	if (ignoredFiles.has(fileName)) {
		return true;
	}

	const extension = extensionOf(fileName);
	if (extension) {
		const ignoredExtensions = new Set(config.ignoredExtensions.map((ext) => ext.toLowerCase()));
		if (ignoredExtensions.has(extension)) {
			return true;
		}
	}

	return false;
}
