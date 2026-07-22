# Change Log

All notable changes to the "backtrail" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
