# Change Log

All notable changes to the "backtrail" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
