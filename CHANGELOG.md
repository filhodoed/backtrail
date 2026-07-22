# Change Log

All notable changes to the "backtrail" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.3] - 2026-07-22

### Changed

- Publisher branding assets (used on the Marketplace publisher profile page, not by the extension itself) are no longer bundled into the packaged `.vsix`.

## [0.2.2] - 2026-07-22

### Fixed

- Creating a subfolder inside a tracked folder — including the folder just added via the Tracked Folders **+** button — crashed the extension host with an uncaught `EISDIR: illegal operation on a directory, read`. The watcher now skips directories instead of trying to read them as files.
- A tracked folder that had been moved, deleted, or unmounted (an ejected external drive, for example) crashed the entire activation on the next VS Code startup — not just that one folder, but every command backtrail provides, with no way to untrack it short of manually editing extension storage. Activation now skips the unreachable folder and keeps going.
- Any transient filesystem error inside the watcher (a file removed between the change event and the read, a corrupted history index) could still crash the extension host the same way; watcher callbacks now fail safe instead of throwing.
- Switching the active editor while a tracked folder was unreachable produced an unhandled promise rejection.
- A corrupted history index for a tracked folder used to stay corrupted forever, silently dropping every future save for that folder. It now self-heals on the next capture (past history for that folder is lost, but tracking keeps working).
- When two deleted files shared identical content, a new file with matching content could be attributed to the wrong one as its rename history. It's now matched to the most recently deleted match, which better reflects how a real rename actually happens.
- The packaged `.vsix` was accidentally including this repo's internal `.claude/` configuration.

## [0.2.1] - 2026-07-22

### Fixed

- Adding a folder via the Tracked Folders **+** button could surface a raw `The "path" argument must be of type string. Received undefined` error, most likely when it was the first folder added to an empty window (VS Code reloads the extension host to switch workspace identity in that case, interrupting whatever ran right after). The folder was already tracked by that point either way — `addFolder`/`untrackFolder` now wrap their work in proper error handling so a failure past that point shows a clear backtrail-branded message instead of a raw internal error.

## [0.2.0] - 2026-07-22

### Added

- Dedicated Activity Bar icon and **Tracked Folders** panel, listing every tracked folder with a **Stop Tracking** action.
- **+** button on the Tracked Folders panel to pick any folder from disk, track it, and append it to the workspace (never replaces existing workspace folders).
- **Track this folder** in the Explorer's right-click menu, for folders already open in the workspace.
- **N**/**M** file decorations in the Explorer tree: a new file is badged until first opened, a changed file is re-badged every time it changes after being seen — like an unread-email flag, not a permanent mark. Badges propagate to parent folders.
- Marketplace icon (`media/marketplace-icon.png`) and Activity Bar icon (`media/activity-bar-icon.svg`), sharing the same comet-trail mark.

## [0.1.0] - 2026-07-22

### Added

- `Backtrail: Track this folder` command, opt-in per folder, refuses folders inside a git repository.
- Continuous capture of save, create, delete, and rename events, filtered by configurable ignored folders/extensions and a max file size.
- Rename/move correlation by content hash, working for renames performed outside VS Code (Finder, `mv`), not just through the editor.
- **Backtrail History** panel in the Explorer, showing the active file's version history.
- Diff view for text and image versions; version info (no diff) for other binary formats.
- Non-destructive restore into a `restored/` folder, mirroring the original folder structure.
- Automatic retention: snapshots older than 45 days (configurable) are pruned.
- Settings: `backtrail.ignoredFolders`, `backtrail.ignoredExtensions`, `backtrail.maxFileSizeMB`, `backtrail.retentionDays`.
