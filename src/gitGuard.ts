import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function isInsideGitRepo(folderPath: string): boolean {
	let current = folderPath;
	while (true) {
		if (existsSync(join(current, '.git'))) {
			return true;
		}
		const parent = dirname(current);
		if (parent === current) {
			return false;
		}
		current = parent;
	}
}
