import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { formatBytes } from './format';
import { readSnapshotContent, type SnapshotVersion } from './snapshotStore';

export const SHOW_DIFF_COMMAND = 'backtrail.showDiff';
export const SHOW_VERSION_INFO_COMMAND = 'backtrail.showVersionInfo';

export function registerDiffCommand(context: vscode.ExtensionContext, storeRoot: string): void {
	const tempDirs: string[] = [];

	context.subscriptions.push(
		vscode.commands.registerCommand(
			SHOW_DIFF_COMMAND,
			(folder: string, older: SnapshotVersion, newer: SnapshotVersion) =>
				showDiff(storeRoot, folder, older, newer, tempDirs),
		),
		vscode.commands.registerCommand(SHOW_VERSION_INFO_COMMAND, (version: SnapshotVersion) => showVersionInfo(version)),
		new vscode.Disposable(() => {
			for (const dir of tempDirs) {
				rmSync(dir, { recursive: true, force: true });
			}
		}),
	);
}

async function showDiff(
	storeRoot: string,
	folder: string,
	older: SnapshotVersion,
	newer: SnapshotVersion,
	tempDirs: string[],
): Promise<void> {
	const tmpRoot = mkdtempSync(join(tmpdir(), 'backtrail-diff-'));
	tempDirs.push(tmpRoot);

	const oldPath = writeTempSide(tmpRoot, 'old', storeRoot, folder, older);
	const newPath = writeTempSide(tmpRoot, 'new', storeRoot, folder, newer);

	const title = `${basename(newer.relPath)} (${formatTimestamp(older.timestamp)} ↔ ${formatTimestamp(newer.timestamp)})`;
	await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(oldPath), vscode.Uri.file(newPath), title);
}

function writeTempSide(
	tmpRoot: string,
	side: 'old' | 'new',
	storeRoot: string,
	folder: string,
	version: SnapshotVersion,
): string {
	// Written with the version's own filename (not the content-hashed blob
	// name) so VS Code's diff editor detects the real extension — that's
	// what makes syntax highlighting and the native image-diff view work.
	const dir = join(tmpRoot, side);
	mkdirSync(dir, { recursive: true });
	const filePath = join(dir, basename(version.relPath));
	writeFileSync(filePath, readSnapshotContent(storeRoot, folder, version));
	return filePath;
}

async function showVersionInfo(version: SnapshotVersion): Promise<void> {
	const when = formatTimestamp(version.timestamp);
	void vscode.window.showInformationMessage(
		`${basename(version.relPath)} — ${when}, ${formatBytes(version.sizeBytes)}. No diff preview available for this file type.`,
	);
}

function formatTimestamp(iso: string): string {
	return new Date(iso).toLocaleString();
}
