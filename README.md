<img src="media/marketplace-icon.png" alt="Backtrail icon" width="96" height="96">

# backtrail

[![Version](https://img.shields.io/visual-studio-marketplace/v/filhodoed.backtrail?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=filhodoed.backtrail)
[![CI](https://img.shields.io/github/actions/workflow/status/filhodoed/backtrail/ci.yml?branch=main&label=tests)](https://github.com/filhodoed/backtrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Continuous file history for folders without git — track every save, view diffs, and restore any version without overwriting your files.

Not a lightweight git. There's no staging, no commits, no branches. You track a folder, and from then on every save, create, delete, and rename becomes a point in that file's history automatically — visible in a panel, diffable, restorable. Built for people who work with files, not repositories.

## Contents

- [Quick start](#quick-start)
- [Features](#features)
- [Requirements](#requirements)
- [Extension settings](#extension-settings)
- [Known limitations](#known-limitations)
- [Development](#development)
- [License](#license)

## Quick start

1. Right-click any folder in the Explorer → **Track this folder**. (Or use the **+** button in the **Tracked Folders** panel — Backtrail's own icon in the Activity Bar — to track a folder from anywhere on disk.)
2. Keep working normally. Every save, create, delete, and rename in that folder becomes a new point in that file's history — nothing to commit, nothing to remember to do.
3. Select a file to see its full history in the **Backtrail History** panel, or open the **Changes** panel for everything that changed across all tracked folders since you last looked.
4. Click any version to diff it. Right-click a version → **Restore this version** to bring it back without touching your current file.

That's the whole workflow. No staging area, no commit messages, nothing to configure to get started.

## Features

- **Opt-in tracking, per folder.** Right-click any folder in the Explorer → **Track this folder** — or use the **+** button in the **Tracked Folders** panel (Backtrail's own icon in the Activity Bar) to pick a folder from anywhere on disk; it gets added to your workspace tree automatically. A folder inside a git repository can't be tracked — if you're already using git there, this isn't for that folder. Every file already in the folder gets a baseline snapshot at that moment, so the first real edit afterward has something genuine to diff against.
- **Continuous history panel.** Select any file in a tracked folder and its version history shows up in the **Backtrail History** view in the Explorer sidebar, newest first.
- **Changes panel, git-style.** Backtrail's Activity Bar icon has its own **Changes** view — a separate, resizable panel below **Tracked Folders**, the same layout git's Source Control uses for "Changes"/"Staged Changes". It lists every pending change across all tracked folders, split into **Modified** and **New**, aggregated regardless of how many folders you track. Click a file to open its diff; it's marked seen and drops off the list automatically.
- **New/changed badges and color in the Explorer tree.** A file gets an **N** badge the first time it's captured, or an **M** badge when it changes again after you've already seen it — like an unread-email flag, not a permanent mark — plus the same green git uses for added/untracked files. Opening the file in the editor, or clicking it in the **Changes** panel, clears its badge; if it changes again afterward, the badge comes back. A folder containing a badged file shows a subtle indicator too.
- **Mark All Changes As Seen.** Right-click a tracked folder → clears every New/Modified entry for that folder in one action — useful right after tracking a folder full of existing files, so the **Changes** panel starts counting from your next real edit instead of flagging everything that was already there.
- **Real diffs.** Click a text or image version to open it in VS Code's native diff editor. Other binary formats (`.pptx`, `.xlsx`, `.mp4`, `.pdf`, …) show a size and timestamp instead — there's no meaningful diff to show for those.
- **Non-destructive restore.** Right-click any version → **Restore this version**. It never overwrites your current file — it writes a new file under `restored/`, mirroring the original folder structure, so you decide what to do with it.
- **Survives renames — even from Finder.** Renaming or moving a file outside VS Code (Finder, Explorer, `mv`) is invisible to most extensions. Backtrail correlates a delete and a same-content create within a short window so the file's history keeps going instead of restarting.
- **Tracked Folders panel.** Backtrail's own Activity Bar icon lists every folder you're tracking. Right-click one → **Stop Tracking**; you'll be asked whether to also delete that folder's saved history, and — if it's part of your workspace — whether to remove it from the Explorer tree too.

## Requirements

None beyond VS Code itself. Everything runs locally; nothing leaves your machine.

## Extension settings

This extension contributes the following settings:

| Setting                       | Description                                                     | Default                                                          |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `backtrail.ignoredFolders`    | Folder names never tracked, at any depth                        | `node_modules`, `.git`, `dist`, `build`, `restored`              |
| `backtrail.ignoredFiles`      | Exact file names never tracked, anywhere in a tracked folder    | `.env`, `.env.local`, `id_rsa`, `id_ed25519`, `.npmrc`, `.netrc` |
| `backtrail.ignoredExtensions` | File extensions never tracked, e.g. `.log`, `.tmp`              | none                                                             |
| `backtrail.maxFileSizeMB`     | Files larger than this are never tracked                        | `50`                                                             |
| `backtrail.retentionDays`     | Snapshots older than this many days are discarded automatically | `45`                                                             |

## Known limitations

- A rename performed outside VS Code is only recognized if the new file appears within 5 seconds of the old one being deleted, with identical content. A rename combined with an edit in the same instant may not be recognized as a continuation.
- Consecutive saves of an already-tracked file collapse into one version once the file goes quiet (see `backtrail.captureDebounceSeconds`). A rename or delete that lands mid-debounce is flushed as its own version first, so no edit is lost — but tools that save via a temp-file-then-rename pattern in very quick succession may still see that flush land as a slightly different intermediate version than you'd get from watching every keystroke.
- Snapshots are stored unencrypted in VS Code's global storage for the extension, readable only by your own user account (files and folders there are created with owner-only permissions). Don't track folders with secrets you wouldn't want readable on disk.
- Tracking state and history don't sync across machines.

## Development

Requires Node 24+ — unit tests run `.ts` files directly via `node --test`, relying on native TypeScript type-stripping (no `ts-node`/`tsx`).

```bash
npm install
npm test          # unit tests (node --test) + integration tests (real VS Code host)
npm run format    # formats src/ and test/ with prettier
npm run lint      # eslint
npm run package   # builds dist/extension.js
```

Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE).
