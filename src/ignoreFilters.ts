export interface IgnoreConfig {
	ignoredFolders: string[];
	ignoredExtensions: string[];
	maxFileSizeBytes: number;
}

export const DEFAULT_IGNORED_FOLDERS = ['node_modules', '.git', 'dist', 'build'];
export const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function splitSegments(relPath: string): string[] {
	return relPath.split(/[\\/]+/).filter(Boolean);
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

	const segments = splitSegments(relPath);
	const ignoredFolders = new Set(config.ignoredFolders);
	if (segments.slice(0, -1).some((segment) => ignoredFolders.has(segment))) {
		return true;
	}

	const fileName = segments[segments.length - 1] ?? '';
	const extension = extensionOf(fileName);
	if (extension) {
		const ignoredExtensions = new Set(config.ignoredExtensions.map((ext) => ext.toLowerCase()));
		if (ignoredExtensions.has(extension)) {
			return true;
		}
	}

	return false;
}
