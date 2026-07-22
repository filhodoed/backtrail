import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function slugify(segment: string): string {
	return segment
		.normalize('NFD')
		.replace(/\p{Mn}/gu, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '');
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

export function formatRestoreTimestamp(date: Date): string {
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `${year}-${month}-${day}-${hours}${minutes}`;
}

function splitRelPath(relPath: string): string[] {
	return relPath.split(/[\\/]+/).filter(Boolean);
}

function splitNameAndExtension(fileName: string): { base: string; extension: string } {
	const lastDot = fileName.lastIndexOf('.');
	if (lastDot <= 0) {
		return { base: fileName, extension: '' };
	}
	return { base: fileName.slice(0, lastDot), extension: fileName.slice(lastDot) };
}

function buildRestoredFileName(originalFileName: string, timestamp: Date, suffix: number): string {
	const { base, extension } = splitNameAndExtension(originalFileName);
	const stamp = formatRestoreTimestamp(timestamp);
	const suffixPart = suffix > 1 ? `-${suffix}` : '';
	return `${base}.restored-${stamp}${suffixPart}${extension}`;
}

function restoredDirFor(trackedFolderAbsolutePath: string, relPath: string): string {
	const folderSegments = splitRelPath(relPath).slice(0, -1).map(slugify);
	return join(trackedFolderAbsolutePath, 'restored', ...folderSegments);
}

export function resolveRestorePath(
	trackedFolderAbsolutePath: string,
	relPath: string,
	timestamp: Date,
	existsFn: (path: string) => boolean = existsSync,
): string {
	const segments = splitRelPath(relPath);
	const fileName = segments[segments.length - 1] ?? '';
	const dir = restoredDirFor(trackedFolderAbsolutePath, relPath);

	let suffix = 1;
	while (true) {
		const candidate = join(dir, buildRestoredFileName(fileName, timestamp, suffix));
		if (!existsFn(candidate)) {
			return candidate;
		}
		suffix++;
	}
}

export function writeRestoredFile(
	trackedFolderAbsolutePath: string,
	relPath: string,
	timestamp: Date,
	content: Uint8Array,
): string {
	const destination = resolveRestorePath(trackedFolderAbsolutePath, relPath, timestamp);
	mkdirSync(dirname(destination), { recursive: true });
	writeFileSync(destination, content);
	return destination;
}
