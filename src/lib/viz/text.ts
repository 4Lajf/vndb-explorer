/**
 * Text width estimates for chart layout. Layout is pure maths with no DOM, so
 * a label's width is estimated from its characters: kana, Han, Hangul and
 * full-width forms take a full em, Latin text a little over half of one.
 */

/** Is this code point drawn a full em wide (East Asian wide or full-width)? */
export function isWideChar(cp: number): boolean {
	return (
		(cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
		(cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals, kana, Han, Yi
		(cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
		(cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
		(cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
		(cp >= 0xff00 && cp <= 0xff60) || // full-width ASCII and punctuation
		(cp >= 0xffe0 && cp <= 0xffe6) || // full-width signs
		(cp >= 0x20000 && cp <= 0x3fffd) // Han extensions
	);
}

/** Estimated width of `text`, given the width of a narrow and of a wide character. */
export function estimateTextWidth(text: string, narrowW: number, wideW: number): number {
	let w = 0;
	for (const ch of text) w += isWideChar(ch.codePointAt(0) ?? 0) ? wideW : narrowW;
	return w;
}
