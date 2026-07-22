# backtrail

Continuous file history for folders without git — track every save, view diffs, and restore any version without overwriting your files.

Not a lightweight git. There's no staging, no commits, no branches. You track a folder, and from then on every save, create, delete, and rename becomes a point in that file's history automatically — visible in a panel, diffable, restorable. Built for people who work with files, not repositories.

## Features

- **Opt-in tracking, per folder.** Right-click any folder in the Explorer → **Track this folder** — or use the **+** button in the **Tracked Folders** panel (Backtrail's own icon in the Activity Bar) to pick a folder from anywhere on disk; it gets added to your workspace tree automatically. A folder inside a git repository can't be tracked — if you're already using git there, this isn't for that folder.
- **Continuous history panel.** Select any file in a tracked folder and its version history shows up in the **Backtrail History** view in the Explorer sidebar, newest first.
- **New/changed badges in the Explorer tree.** A file gets an **N** badge the first time it's captured, or an **M** badge when it changes again after you've already seen it — like an unread-email flag, not a permanent mark. Opening the file in the editor clears its badge; if it changes again afterward, the **M** comes back. A folder containing a badged file shows a subtle indicator too.
- **Real diffs.** Click a text or image version to open it in VS Code's native diff editor. Other binary formats (`.pptx`, `.xlsx`, `.mp4`, `.pdf`, …) show a size and timestamp instead — there's no meaningful diff to show for those.
- **Non-destructive restore.** Right-click any version → **Restore this version**. It never overwrites your current file — it writes a new file under `restored/`, mirroring the original folder structure, so you decide what to do with it.
- **Survives renames — even from Finder.** Renaming or moving a file outside VS Code (Finder, Explorer, `mv`) is invisible to most extensions. Backtrail correlates a delete and a same-content create within a short window so the file's history keeps going instead of restarting.
- **Tracked Folders panel.** Backtrail's own Activity Bar icon lists every folder you're tracking. Right-click one → **Stop Tracking**; if it's part of your workspace, you'll be asked whether to also remove it from the Explorer tree.

## Requirements

None beyond VS Code itself. Everything runs locally; nothing leaves your machine.

## Extension Settings

This extension contributes the following settings:

- `backtrail.ignoredFolders`: Folder names never tracked, at any depth (default: `node_modules`, `.git`, `dist`, `build`).
- `backtrail.ignoredExtensions`: File extensions never tracked, e.g. `.log`, `.tmp` (default: none).
- `backtrail.maxFileSizeMB`: Files larger than this are never tracked (default: `50`).
- `backtrail.retentionDays`: Snapshots older than this many days are discarded automatically (default: `45`).

## Known limitations

- A rename performed outside VS Code is only recognized if the new file appears within a few seconds of the old one being deleted, with identical content. A rename combined with an edit in the same instant may not be recognized as a continuation.
- Snapshots are stored unencrypted in VS Code's global storage for the extension. Don't track folders with secrets you wouldn't want readable on disk.
- Tracking state and history don't sync across machines.

## Development

Requires Node 24+ — unit tests run `.ts` files directly via `node --test`, relying on native TypeScript type-stripping (no `ts-node`/`tsx`).

```bash
npm install
npm test        # unit tests (node --test) + integration tests (real VS Code host)
npm run package # builds dist/extension.js
```

Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE).
