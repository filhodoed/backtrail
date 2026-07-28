# Sample workspace

Opened as the workspace for `test:integration` (see `workspaceFolder` in
`.vscode-test.mjs`). Its only job is to keep `vscode.workspace.workspaceFolders`
non-empty for the whole run: adding the very first folder to an otherwise
empty workspace crosses VS Code's empty-to-non-empty boundary and restarts
the extension host mid-test, which is what made
`trackedFoldersCommands.test.ts`'s `waitForWorkspaceFolderChange` time out
intermittently. Never add or remove files here from a test.
