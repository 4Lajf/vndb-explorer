<img src="assets/icon.svg" width="64" height="64" alt="VNDB Explorer icon">

# VNDB Explorer

An interactive atlas and research tool for exploring visual novel studios, staff careers, unrecorded brand relationships, potential staff aliases, and popularity rankings from the official [VNDB database dump](https://vndb.org/d14).

## Features

- **Studio Atlas (`/`)** — Pan-and-zoom timeline of VN studio families across decades, showing both explicit VNDB relations (ownership, imprints, renames, spin-offs) and inferred links (sister brands, sub-brands, successors, partners).
- **VN-by-VN Career Trails** — Trace any creator or seiyuu across studios over time, inspect alias/pen-name changes, overlay unconfirmed potential aliases, and export high-DPI PNG timelines.
- **Hidden Brand Links (`/discover/brands`) & Brand Compare (`/compare`)** — Surface studio relationships implied by shared core staff, co-developed titles, and shared external links that VNDB does not explicitly record.
- **Potential Aliases (`/discover/aliases`)** — Review candidate separate staff records that may belong to the same person, with side-by-side career evidence.
- **Corpus Overview (`/overview`) & Popularity Rankings (`/popularity`)** — Most-voted and highest-rated creators, seiyuu, studios, visual novels, career records, and decade breakdowns.

---

## Requirements

- **Node.js `>= 22.13`** (uses built-in `node:sqlite` and `--experimental-strip-types`)
- **`curl`**, **`tar`**, and **`zstd`** (for downloading and extracting VNDB `.tar.zst` dumps)
  - Windows 10/11: `curl.exe` and `tar` (with zstd support) are built in.
  - Linux (Debian/Ubuntu): `sudo apt install curl tar zstd`
  - macOS: `brew install zstd`

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Download the latest VNDB dump and build data/vndb.sqlite (~1–2 min)
npm run db:refresh

# 3. Start the dev server (http://localhost:5173)
npm run dev
```

### Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite + SvelteKit development server |
| `npm run check` | Run `svelte-kit sync` and `svelte-check` |
| `npm run build` | Build production Node bundle (`build/`) |
| `npm start` | Run the built production server (`node build/index.js`) |
| `npm run db:refresh` | Download latest VNDB dump (`dl.vndb.org`) and rebuild `data/vndb.sqlite` |
| `npm run db:refresh:clean` | Same as `db:refresh`, then removes the raw extracted dump (~700 MB saved) |
| `npm run db:build` | Rebuild `data/vndb.sqlite` from an already-extracted `data/vndb-db/` folder |

---

## Updating / Parsing Newer VNDB Dumps

The SQLite database (`data/vndb.sqlite`, ~170 MB) is excluded from Git (exceeds GitHub's 100 MB file limit). Everything required to reproduce or update it from any official VNDB dump lives in `scripts/`:

- [`scripts/refresh-dump.ts`](scripts/refresh-dump.ts) — Downloads `https://dl.vndb.org/dump/vndb-db-latest.tar.zst` (or a custom `VNDB_DUMP_URL`) into `data/vndb-db-latest.tar.zst` and extracts it into `data/vndb-db/`.
- [`scripts/build-db.ts`](scripts/build-db.ts) — Parses the raw PostgreSQL COPY TSV files in `data/vndb-db/db/`, builds the full-text search index, computes staff tenures & transitions, infers brand relationships and potential alias candidates, and writes `data/vndb.sqlite` atomically via `vndb.sqlite.tmp`.

### Parsing the latest dump

```bash
npm run db:refresh
# or clean up raw dump files automatically after building:
npm run db:refresh:clean
```

### Parsing a specific archived or local dump

```bash
# Custom dump URL:
VNDB_DUMP_URL="https://dl.vndb.org/dump/vndb-db-2026-11-23.tar.zst" npm run db:refresh:clean

# Or if you already extracted a dump into data/vndb-db/:
npm run db:build
```

### Environment variables for DB scripts

| Variable | Default | Purpose |
| --- | --- | --- |
| `VNDB_DATA_DIR` | `./data` | Directory holding `vndb-db/` and the downloaded archive |
| `VNDB_DB_PATH` | `./data/vndb.sqlite` | Output path for the built SQLite file (also read by the web app) |
| `VNDB_DUMP_URL` | `https://dl.vndb.org/dump/vndb-db-latest.tar.zst` | Source dump archive URL |
| `CLEAN_DUMP` | `0` | Set to `1` (or pass `--clean`) to delete raw dump files after building |

---

## Hosting on Coolify

This repo ships with a production multi-stage [`Dockerfile`](Dockerfile), [`.dockerignore`](.dockerignore), healthcheck endpoint (`GET /api/health`), and smart startup entrypoint ([`scripts/docker-entrypoint.sh`](scripts/docker-entrypoint.sh)).

### Coolify App Settings

1. Create a new **Application → Public/Private Git Repository** pointing to this repo.
2. **Build Pack:** `Dockerfile`
3. **Ports Exposes:** `3000`
4. **Healthcheck:** enabled, Path `/api/health`, Port `3000`
5. **Environment Variables:**
   - `ORIGIN=https://your-domain.example.com` (recommended for SvelteKit behind Traefik/Caddy)

### Choosing how to provide `vndb.sqlite` (3 options)

#### Option 1 — Bake the DB into the Docker image (recommended if you rarely update the DB)
Zero volumes and zero manual uploads. In Coolify, add a **Build Variable**:
- `BUILD_DB=1`

During the Docker build, the `db-builder` stage downloads the latest VNDB dump, builds `/app/data/vndb.sqlite`, removes the raw dump files, and copies only the clean SQLite file into the final image. Container startup takes under 1 second.

> **Note:** The Docker build needs ~2 GB RAM and ~2–3 minutes when `BUILD_DB=1`. If you later push UI-only code changes and don't want to re-parse the dump on every deploy, switch to Option 2 or Option 3.

#### Option 2 — Persistent Volume + GitHub Release snapshot (fastest redeploys)
1. Build once locally (`npm run db:refresh`), compress it (~45 MB):
   ```bash
   zstd -19 data/vndb.sqlite -o vndb.sqlite.zst
   ```
2. Upload `vndb.sqlite.zst` as a **GitHub Release** asset (GitHub Releases allow up to 2 GB per file).
3. In Coolify:
   - Add **Persistent Storage**: Destination Path `/app/data`.
   - Keep `BUILD_DB=0` (default — code-only deploys build in ~15 seconds).
   - Add runtime Environment Variable:
     ```env
     VNDB_DB_URL=https://github.com/<owner>/<repo>/releases/download/<tag>/vndb.sqlite.zst
     ```
On first boot, the entrypoint downloads and unpacks `vndb.sqlite` into `/app/data/vndb.sqlite`. Subsequent deploys reuse the volume instantly. To upgrade to a newer dump later, delete `/app/data/vndb.sqlite` in Coolify's terminal, update `VNDB_DB_URL`, and restart.

#### Option 3 — Persistent Volume + rebuild inside Coolify
1. Add **Persistent Storage** at `/app/data`.
2. Either copy your local `data/vndb.sqlite` into the volume once, or set `AUTO_BUILD_DB=1` for the first boot (or run `npm run db:refresh:clean` in Coolify's container terminal whenever you want to pull a newer VNDB dump).

---

## License & Data Attribution

Visual novel, producer, and staff data come from the [VNDB database dump](https://vndb.org/d14) (ODbL / DbCL). Inferred brand links and potential aliases are computed by [`scripts/build-db.ts`](scripts/build-db.ts) and are clearly separated from VNDB data throughout the UI.
