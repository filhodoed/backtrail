import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isInsideGitRepo } from '../../src/gitGuard.ts';

function makeTempRoot(t: { after: (fn: () => void) => void }): string {
	const root = mkdtempSync(join(tmpdir(), 'backtrail-gitguard-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return root;
}

test('should_return_false_when_no_git_repo_in_ancestry', (t) => {
	const root = makeTempRoot(t);
	const deep = join(root, 'a', 'b', 'c');
	mkdirSync(deep, { recursive: true });

	const result = isInsideGitRepo(deep);

	assert.equal(result, false);
});

test('should_return_true_when_folder_itself_has_git', (t) => {
	const root = makeTempRoot(t);
	mkdirSync(join(root, '.git'));

	const result = isInsideGitRepo(root);

	assert.equal(result, true);
});

test('should_return_true_when_ancestor_two_levels_up_has_git', (t) => {
	const root = makeTempRoot(t);
	mkdirSync(join(root, '.git'));
	const deep = join(root, 'a', 'b');
	mkdirSync(deep, { recursive: true });

	const result = isInsideGitRepo(deep);

	assert.equal(result, true);
});

test('should_return_false_for_sibling_folder_of_a_git_repo', (t) => {
	const root = makeTempRoot(t);
	mkdirSync(join(root, 'repo-with-git', '.git'), { recursive: true });
	const sibling = join(root, 'plain-folder');
	mkdirSync(sibling, { recursive: true });

	const result = isInsideGitRepo(sibling);

	assert.equal(result, false);
});
