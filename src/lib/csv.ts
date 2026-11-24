/**
 * CSV export shared by the Discover pages. Exports carry names typed by the
 * public into VNDB, so every cell is written to be inert in a spreadsheet.
 */

/** Characters that make a spreadsheet read a cell as a formula (CWE-1236). */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Byte-order mark: without it Excel on Windows reads UTF-8 as the system code page. */
const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * One CSV cell. Text that would start a formula gets a leading apostrophe, the
 * spreadsheet convention for "this is text"; numbers pass through, so a
 * negative value stays a number. Cells holding a quote, comma, CR or LF are
 * quoted, with inner quotes doubled.
 */
export function csvCell(value: unknown): string {
	let s = value == null ? '' : String(value);
	if (typeof value !== 'number' && FORMULA_LEAD.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A CSV document (RFC 4180): the header row, then the rows, CRLF between them.
 * Row 1 is always the header, so a spreadsheet or a parser needs no setup.
 *
 * `provenance` says where the rows come from. It is written as a last column on
 * every row, not as a comment line: CSV has no comments, and a `#` line would
 * be read as the header.
 */
export function toCsv(
	head: readonly string[],
	rows: ReadonlyArray<readonly unknown[]>,
	provenance?: string
): string {
	const note = provenance?.replace(/[\r\n]+/g, ' ').trim();
	const lines: string[] = [];
	lines.push((note ? [...head, 'provenance'] : head).map(csvCell).join(','));
	for (const row of rows) lines.push((note ? [...row, note] : row).map(csvCell).join(','));
	return lines.join('\r\n');
}

/** Hand a CSV document to the browser as a UTF-8 file download. */
export function downloadCsv(filename: string, csv: string): void {
	const blob = new Blob([UTF8_BOM, csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	// Safari starts the download after this task ends: revoking the URL at once
	// can cancel it. A second is ample, and the blob is freed all the same.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
