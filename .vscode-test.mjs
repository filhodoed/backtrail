import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// Keeps vscode.workspace.workspaceFolders non-empty for the whole run —
	// see test/sample-workspace/README.md for why that matters.
	workspaceFolder: 'test/sample-workspace',
	mocha: {
		timeout: 20000,
	},
});
