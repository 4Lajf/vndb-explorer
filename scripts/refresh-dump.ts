import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(process.env.VNDB_DATA_DIR || path.join(ROOT, 'data'));
const ARCHIVE_PATH = path.join(DATA_DIR, 'vndb-db-latest.tar.zst');
const EXTRACT_DIR = path.join(DATA_DIR, 'vndb-db');
const DUMP_URL = process.env.VNDB_DUMP_URL || 'https://dl.vndb.org/dump/vndb-db-latest.tar.zst';

const isWin = process.platform === 'win32';
const curlBin = isWin ? 'curl.exe' : 'curl';

fs.mkdirSync(DATA_DIR, { recursive: true });

console.log(`Downloading ${DUMP_URL} -> ${ARCHIVE_PATH}...`);
execFileSync(curlBin, ['-L', '-sS', '--fail', '-o', ARCHIVE_PATH, DUMP_URL], {
	stdio: 'inherit'
});

// Clear any prior extracted dump so removed tables never linger across upgrades.
fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
fs.mkdirSync(EXTRACT_DIR, { recursive: true });

console.log(`Extracting ${ARCHIVE_PATH} -> ${EXTRACT_DIR}...`);
try {
	if (isWin) {
		// Windows bsdtar handles .tar.zst natively.
		execFileSync('tar', ['-xf', ARCHIVE_PATH, '-C', EXTRACT_DIR], { stdio: 'inherit' });
	} else {
		// Linux / macOS GNU tar or bsdtar with zstd installed.
		execFileSync('tar', ['-I', 'zstd', '-xf', ARCHIVE_PATH, '-C', EXTRACT_DIR], { stdio: 'inherit' });
	}
} catch (err) {
	console.error(
		'Failed to extract .tar.zst archive. Make sure `tar` and `zstd` are installed (e.g. `apt install zstd` or `brew install zstd`).'
	);
	throw err;
}

const tsPath = path.join(EXTRACT_DIR, 'TIMESTAMP');
if (fs.existsSync(tsPath)) {
	console.log(`VNDB dump ready. Timestamp: ${fs.readFileSync(tsPath, 'utf8').trim()}`);
}
