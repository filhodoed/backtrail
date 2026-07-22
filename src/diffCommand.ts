import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { formatBytes } from './format';
import { readSnapshotContent, type SnapshotVersion } from './snapshotStore';

export const SHOW_DIFF_COMMAND = 'backtrail.showDiff';
export const SHOW_VERSION_INFO_COMMAND = 'backtrail.showVersionInfo';

export function registerDiffCommand(context: vscode.ExtensionContext, storeRoot: string): void {
	const tmpRoot = mkdtempSync(join(tmpdir(), 'backtrail-diff-'));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			SHOW_DIFF_COMMAND,
			(folder: string, older: SnapshotVersion, newer: SnapshotVersion) =>
				showDiff(storeRoot, folder, older, newer, tmpRoot),
		),
		vscode.commands.registerCommand(SHOW_VERSION_INFO_COMMAND, (version: SnapshotVersion) => showVersionInfo(version)),
		new vscode.Disposable(() => rmSync(tmpRoot, { recursive: true, force: true })),
	);
}

async function showDiff(
	storeRoot: string,
	folder: string,
	older: SnapshotVersion,
	newer: SnapshotVersion,
	tmpRoot: string,
): Promise<void> {
	const oldPath = writeTempSide(tmpRoot, storeRoot, folder, older);
	const newPath = writeTempSide(tmpRoot, storeRoot, folder, newer);

	const title = `${basename(newer.relPath)} (${formatTimestamp(older.timestamp)} ↔ ${formatTimestamp(newer.timestamp)})`;
	await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(oldPath), vscode.Uri.file(newPath), title);
}

function writeTempSide(tmpRoot: string, storeRoot: string, folder: string, version: SnapshotVersion): string {
	// Keyed by content hash (same address space as the blob store) and kept
	// for the whole session instead of one throwaway dir per click: repeat
	// clicks on a pair already open skip the disk write entirely, and cleanup
	// is one rmSync on deactivate instead of one leaked directory per diff.
	// Filename still uses the version's own basename (not the hash) so VS
	// Code's diff editor detects the real extension — that's what makes
	// syntax highlighting and the native image-diff view work.
	const dir = join(tmpRoot, version.contentHash);
	const filePath = join(dir, basename(version.relPath));
	if (!existsSync(filePath)) {
		mkdirSync(dir, { recursive: true });
		writeFileSync(filePath, readSnapshotContent(storeRoot, folder, version));
	}
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
