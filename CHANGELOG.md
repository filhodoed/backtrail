# Change Log

All notable changes to the "backtrail" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-07-26

### Added

- New `backtrail.ignoredFiles` setting — exact file names never tracked, anywhere in a tracked folder (default: `.env`, `.env.local`, `id_rsa`, `id_ed25519`, `.npmrc`, `.netrc`).
- Stop Tracking now offers to delete the folder's saved history.

### Changed

- `restored/` is now in the default ignored folders, so restoring a version doesn't immediately get captured as a new tracked file.
- Snapshots are now stored with owner-only file permissions instead of the previous defaults; existing tracked folders are upgraded automatically the next time you open VS Code.

### Fixed

- A crash mid-write could truncate the on-disk history index; writes are now atomic, with an automatic backup and recovery.
- A corrupted snapshot would previously fail silently in a diff or restore; this is now detected and reported clearly.

## [0.5.0] - 2026-07-24

### Added

- Cancelling a baseline capture in progress (the Cancel button on its notification) now stops tracking that folder entirely, instead of leaving it half-tracked with no history — cancelling almost always means the wrong folder was picked in the first place.

### Fixed

- Chunking baseline capture (0.4.0) to stop it from freezing the extension host also removed the only visible sign, in the Changes view itself, that anything was still happening on a large folder — the notification toast is easy to miss or dismiss. A spinner in the Changes view now runs for the same duration as the notification.

## [0.4.1] - 2026-07-24

### Fixed

- **Mark All Changes As Seen** had the same freeze-shaped problem as baseline capture (fixed in 0.4.0) on a large tracked folder: it wrote the whole seen-versions store over again, once per file, sequentially. It now collects every change and writes once.

## [0.4.0] - 2026-07-24

### Added

- **Track Folder by Path**, a new command (and toolbar button next to **+**) that tracks a folder by typed path instead of the file picker — the only way to reach a hidden folder, since the OS folder picker hides dotfiles/dotfolders by default with no VS Code API to override it.
- Tracking your entire home folder now asks for confirmation first, since it drags in caches, every project's `node_modules`, mail, photo libraries, and used to be the only way to reach a hidden folder before the by-path command above existed.

### Fixed

- Tracking a large folder (a home directory, for example) froze the extension host for minutes with no way to cancel, often forcing a VS Code restart — the baseline snapshot walk that runs when a folder is first tracked read and hashed every file, and rewrote the entire history index from scratch, once per file, with no yielding. It now works in chunks, yields to the event loop between chunks, writes the index once per chunk instead of once per file, and runs behind a cancellable progress notification instead of blocking silently.
- A duplicate-content save (the watcher firing twice for one edit, a formatter re-saving identical output) rewrote the history index on disk even though nothing changed, a regression introduced while building the chunked baseline capture above — fixed before release.

## [0.3.0] - 2026-07-23

### Added

- **Changes** view, alongside **Tracked Folders**, as its own resizable panel — the same layout git's own Source Control panel uses for "Changes"/"Staged Changes", rather than a chevron nested inside one tree. Lists every pending change across all tracked folders, split into **Modified** and **New**. Clicking a file opens its diff and marks it as seen.
- Tracking a folder now captures a baseline snapshot of every file already in it, so the first real edit afterward has something genuine to diff against instead of comparing against nothing.
- **Mark All Changes As Seen**, a right-click action on a tracked folder, clears the New/Modified backlog that baseline capture creates (or after catching up on a batch of changes) in one action instead of opening every file by hand.
- New and changed files are now colored green in the Explorer tree, matching git's own added/untracked color, alongside the existing **N**/**M** badge.
- Marketplace category changed from **Other** to **SCM Providers**, which is what this extension actually is.

### Fixed

- A file's first captured version had no diff command at all — clicking its only timestamp did nothing. It now diffs against an empty file, the same way git shows a brand-new file as entirely additions.
- Saving a file that was already the active editor never cleared its New/Modified badge, since "seen" state only ever updated when switching which file was active. Saving the active file now marks it seen too.
- A save that fired the file watcher twice for the same edit (happens on some platforms/editors) recorded a duplicate, identical version — pushing the real previous version out of reach and making the newest timestamp's diff show no change at all. Back-to-back captures with identical content and the same path are now collapsed into one version; a rename that keeps content unchanged still gets its own version, since that's the only record of the rename.
- A tracked folder that no longer exists on disk, or a corrupted entry in extension storage, could break the whole Changes list for every other folder — or even make **Add Folder** report a false failure after the folder had already been tracked successfully. Both are now tolerated.

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
