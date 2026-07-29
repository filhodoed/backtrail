// logCaptureWarning only ever calls appendLine — depending on this narrow
// shape instead of the full vscode.OutputChannel (which this module
// deliberately never imports) keeps it loadable from node --test unit tests,
// where the vscode module doesn't exist. A real vscode.OutputChannel already
// satisfies this interface structurally, so callers pass one in as-is.
export interface WarningSink {
	appendLine(value: string): void;
}

// The same failure (a tracked folder stuck on a disconnected drive, a full
// disk) would otherwise print once per file event — every save, every
// watcher restart — drowning the one line that actually matters under a
// flood of duplicates. This keeps at most one line per distinct context
// per window, enough to diagnose without spamming the channel.
const THROTTLE_WINDOW_MS = 60_000;
const lastLoggedAt = new Map<string, number>();

// For contexts and errors that are genuinely internal (a corrupt index that
// self-heals, a folder briefly unreachable) this is purely a diagnostic
// trail — nothing is ever shown to the user from here. Callers that know a
// specific failure compromises capture or restore should show their own
// message; this function only ever writes to the output channel.
export function logCaptureWarning(
	channel: WarningSink,
	context: string,
	error: unknown,
	metadata?: Record<string, string>,
): void {
	const now = Date.now();
	const last = lastLoggedAt.get(context);
	if (last !== undefined && now - last < THROTTLE_WINDOW_MS) {
		return;
	}
	lastLoggedAt.set(context, now);

	const message = error instanceof Error ? error.message : String(error);
	const details = metadata
		? ` (${Object.entries(metadata)
				.map(([key, value]) => `${key}=${value}`)
				.join(', ')})`
		: '';
	channel.appendLine(`[${new Date().toISOString()}] ${context}: ${message}${details}`);
}
