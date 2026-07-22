import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { formatRestoreTimestamp, resolveRestorePath, slugify, writeRestoredFile } from '../../src/restoreService.ts';

interface TestContext {
	after: (fn: () => void) => void;
}

function makeTempDir(t: TestContext): string {
	const dir = mkdtempSync(join(tmpdir(), 'backtrail-restore-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

test('should_slugify_lowercase_and_replace_spaces_with_hyphens', () => {
	assert.equal(slugify('Minhas Notas'), 'minhas-notas');
});

test('should_slugify_strip_accents', () => {
	assert.equal(slugify('não'), 'nao');
});

test('should_slugify_strip_special_characters', () => {
	assert.equal(slugify('Projeto @2026!'), 'projeto-2026');
});

test('should_format_restore_timestamp_as_year_month_day_hour_minute', () => {
	const date = new Date(2026, 6, 20, 14, 32);

	assert.equal(formatRestoreTimestamp(date), '2026-07-20-1432');
});

test('should_pad_single_digit_month_day_hour_minute', () => {
	const date = new Date(2026, 0, 5, 9, 5);

	assert.equal(formatRestoreTimestamp(date), '2026-01-05-0905');
});

test('should_build_restored_path_mirroring_slugified_hierarchy', () => {
	const date = new Date(2026, 6, 20, 14, 32);

	const result = resolveRestorePath('/tracked', 'Docs/Minhas Notas/notas.md', date, () => false);

	assert.equal(result, '/tracked/restored/docs/minhas-notas/notas.restored-2026-07-20-1432.md');
});

test('should_build_restored_path_for_file_without_extension', () => {
	const date = new Date(2026, 6, 20, 14, 32);

	const result = resolveRestorePath('/tracked', 'Makefile', date, () => false);

	assert.equal(result, '/tracked/restored/Makefile.restored-2026-07-20-1432');
});

test('should_increment_suffix_when_restore_path_already_exists', () => {
	const date = new Date(2026, 6, 20, 14, 32);
	const existing = new Set(['/tracked/restored/notas.restored-2026-07-20-1432.md']);

	const result = resolveRestorePath('/tracked', 'notas.md', date, (path) => existing.has(path));

	assert.equal(result, '/tracked/restored/notas.restored-2026-07-20-1432-2.md');
});

test('should_increment_suffix_multiple_times_when_several_collisions_exist', () => {
	const date = new Date(2026, 6, 20, 14, 32);
	const existing = new Set([
		'/tracked/restored/notas.restored-2026-07-20-1432.md',
		'/tracked/restored/notas.restored-2026-07-20-1432-2.md',
	]);

	const result = resolveRestorePath('/tracked', 'notas.md', date, (path) => existing.has(path));

	assert.equal(result, '/tracked/restored/notas.restored-2026-07-20-1432-3.md');
});

test('should_write_restored_file_to_disk_and_return_its_path', (t) => {
	const trackedFolder = makeTempDir(t);
	const date = new Date(2026, 6, 20, 14, 32);

	const destination = writeRestoredFile(trackedFolder, 'notas.md', date, Buffer.from('conteúdo restaurado'));

	assert.equal(destination, join(trackedFolder, 'restored', 'notas.restored-2026-07-20-1432.md'));
	assert.equal(readFileSync(destination, 'utf8'), 'conteúdo restaurado');
});

test('should_create_nested_restored_directories_as_needed', (t) => {
	const trackedFolder = makeTempDir(t);
	const date = new Date(2026, 6, 20, 14, 32);

	const destination = writeRestoredFile(trackedFolder, 'Docs/Minhas Notas/notas.md', date, Buffer.from('v1'));

	assert.equal(
		destination,
		join(trackedFolder, 'restored', 'docs', 'minhas-notas', 'notas.restored-2026-07-20-1432.md'),
	);
	assert.equal(readFileSync(destination, 'utf8'), 'v1');
});
