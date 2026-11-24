#!/bin/sh
set -eu

DB_PATH="${VNDB_DB_PATH:-/app/data/vndb.sqlite}"
DB_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DB_DIR"

if [ ! -f "$DB_PATH" ]; then
	if [ -n "${VNDB_DB_URL:-}" ]; then
		echo "[entrypoint] Downloading prebuilt SQLite database from VNDB_DB_URL -> $DB_PATH..."
		TMP_DL="$DB_PATH.download"
		TMP_OUT="$DB_PATH.tmp"
		curl -fLsS -o "$TMP_DL" "$VNDB_DB_URL"
		case "$VNDB_DB_URL" in
			*.zst|*.zst\?*)
				zstd -d -f -q "$TMP_DL" -o "$TMP_OUT"
				rm -f "$TMP_DL"
				;;
			*.gz|*.gz\?*)
				gzip -dc "$TMP_DL" > "$TMP_OUT"
				rm -f "$TMP_DL"
				;;
			*)
				mv "$TMP_DL" "$TMP_OUT"
				;;
		esac
		mv "$TMP_OUT" "$DB_PATH"
		echo "[entrypoint] Database ready at $DB_PATH."
	elif [ "${AUTO_BUILD_DB:-0}" = "1" ]; then
		echo "[entrypoint] No database at $DB_PATH and AUTO_BUILD_DB=1; fetching VNDB dump and building SQLite..."
		VNDB_DATA_DIR="$DB_DIR" VNDB_DB_PATH="$DB_PATH" npm run db:refresh:clean
	else
		echo "[entrypoint] ERROR: SQLite database not found at $DB_PATH." >&2
		echo "[entrypoint] Provide the database in one of three ways:" >&2
		echo "  1. Rebuild image with build arg BUILD_DB=1 (bakes latest VNDB dump into the image)" >&2
		echo "  2. Set VNDB_DB_URL to a hosted vndb.sqlite / vndb.sqlite.zst / vndb.sqlite.gz URL" >&2
		echo "  3. Mount a persistent volume at /app/data with vndb.sqlite (or set AUTO_BUILD_DB=1)" >&2
		exit 1
	fi
fi

exec node build/index.js
