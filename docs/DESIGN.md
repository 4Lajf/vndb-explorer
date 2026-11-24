# VNDB Explorer — Design Specification

**Codename: Keifu (系譜, "genealogy") — ink and pencil on graphite.**

Status: design spec v2 (visual system: Modern Dark Minimal, section 0) · Scope: visual identity, tokens, data-viz, layout and component blueprint for every route · Stack assumed: SvelteKit + Svelte 5 runes, Tailwind CSS v4, Hono API, SQLite.

Grounded in the VNDB dump dated 2026-11-23 that sits in `data/vndb-db/`: 31,033 producers (`co` 4,859 · `ng` 10,717 · `in` 15,457), 3,854 explicit relation pairs (7,708 directed rows: `imp/ipa` 1,546 · `sub/par` 1,186 · `spa/ori` 752 · `old/new` 370), 55,878 staff records carrying 68,491 alias names, 234,807 staff credits, 105,015 seiyuu credits, 68,308 VNs, 162,160 releases.

---

## 0. Visual system v2 — Modern Dark Minimal

This section is the current visual system. It replaces the warm-paper, serif, vermilion-seal look of v1 everywhere. Sections 1, 3, 4.1, 4.2, 4.5 and 12 below are rewritten to match; sections 5 to 11 keep their structure, behaviour and wording rules, and where one of them still names a v1 visual detail (a seal, a left rail, an eyebrow in capitals, persimmon, a serif), read it through the table at the end of this section. `src/app.css` is the source of truth for values.

**What did not change:** the epistemic grammar of section 2. Ink is still solid, upright and cool; pencil is still dashed, hatched, italic and warm. Only the hues and the surfaces under them moved.

**v2.1 (2026-11-24): the palette was recalibrated.** v2.0's cobalt `#6EA8FE` and amber `#E0A254` still sat close to v1's blue and persimmon, and titles were painted with them, so the new ground still read as the old theme. v2.1 does four things: the epistemic pair becomes a desaturated slate blue and a sand; the relation and role hues are re-searched at lower chroma; titles, zone headers and stat labels stop wearing a register colour; and the last v1 names go (`paper` is now `canvas`, the storage keys no longer say `keifu`).

| Layer | v2 decision |
|---|---|
| Theme | **Dark is the default.** With nothing stored the app is dark, whatever the OS prefers. Light and System are explicit choices in the top bar, both stored in `localStorage` (`vndb-explorer:theme`). The v1 key `keifu:theme` is dropped, not migrated: a `light` stored there was v1's default, not a choice. `keifu:name-order` is carried over to `vndb-explorer:name-order`. `<meta name="theme-color">` follows the theme and is always the `canvas` token. |
| Ground | Cool-neutral graphite, one tonal step per level: canvas `#0F1115`, panel `#14171D`, raised `#1A1E26`, tonal fill `#1C2029`, hover `#232833`. No pure black, no warm brown, no gradients. |
| Structure | Tone first, then translucent hairlines (`rgb(255 255 255 / .08)` and `/ .14`). Tables, filter bars and stat strips sit **on the canvas**; a panel (`sheet`) is kept for discrete objects only: a chart, the verdict, an epistemic zone, a home quick-jump module, the shared-people matrix. Never a panel inside a panel. |
| Corners | Hierarchical: 4px marks and badges, 6px controls and table heads, 10px panels, 14px popovers and drawers. Person pills stay fully round. |
| Type | One family for everything read: **Inter** (true italics, which the hedged verdicts need) with **Noto Sans JP**. **JetBrains Mono** only for IDs, years, role and relation codes, scores and tabular counts. No serif, no capitals-with-tracking labels. |
| Text | Three ink levels, one job each (section 3): `ink` for titles, names and verdicts, `ink-2` for subtitles and prose, `ink-3` for quiet meta. **A title is never coloured.** The register of a block is carried by its glyph, its edge (solid or dashed), its badge and its meter, not by the colour of its heading. |
| Colour | Chrome is neutral. Colour appears only where it encodes something: slate blue for VNDB's record, sand for inference, four relation hues, six role hues. Nothing neon: data hues are capped at OKLCH C ≤ 0.12 on dark and ≤ 0.145 on light (v2.0 reached 0.146 and 0.197), and every hue is checked for contrast and colour-blind separation (section 12). |
| Emphasis | Defaults are quiet. A selected segment, tab or chip is a tonal thumb with full-ink text; the one inverse (light on dark) fill is the primary button and slot A. |
| Mark | A monochrome monogram: one node, a solid line down to a filled node and a dashed line down to a hollow one. Ink on the page's own ground; no brand colour. `static/favicon.svg` and `assets/icon.svg` are the same drawing. |
| Motion | Unchanged: 120ms state changes, no reveal animations, `prefers-reduced-motion` honoured. |

**Reading v1 terms in the sections below**

| v1 term | v2 meaning |
|---|---|
| paper, washi, card | canvas (`canvas`), panel (`surface`) |
| kon indigo `--confirmed`; "cobalt" in v2.0 | slate blue `#86ACEA` (light theme `#31559A`) |
| persimmon `--inferred`; "amber" in v2.0 | sand `#D8B982` (light theme `#77581C`) |
| seal glyph | the same solid square with a check, in slate blue; there is no seal colour and no `--seal` token |
| left rail (`rail-confirmed`, `rail-inferred`) | the panel's own edge: `zone-confirmed` is a solid slate-blue-tinted border (`confirmed-edge`), `zone-inferred` a dashed sand one (`inferred-edge`); the header strip adds a flat blue tint or the sand hatch |
| eyebrow | `caption`: 12px, weight 500, sentence case, no tracking, **in ink**: `ink` as the title of a zone, `ink-3` as a kicker above a title |
| an eyebrow, caption or label "in persimmon" / "text in `inferred`" | an ink label after its register glyph. Register-coloured text survives only inside a badge or chip (`EpistemicBadge`, `PotentialAliasFlag`, a code chip) and on an inferred count set beside its glyph |
| "Ink:" / "Pencil:" in the footer legend | "Solid: stated in VNDB" / "Dashed: inferred by this tool, not VNDB data" |
| `font-display`, serif | removed; names and headings are the sans, weight 600, tightened (`-0.015em` section heads, `-0.025em` page titles) |
| inverse selected item | tonal thumb (`--selected`) with a 1px inset edge |
| `PTN?` | `PTN?`; the class label reads `Partner studio?` when the pair has no co-developed title, `Co-dev partner?` otherwise |

---

## Contents

0. [Visual system v2 — Modern Dark Minimal](#0-visual-system-v2--modern-dark-minimal)
1. [Aesthetic direction](#1-aesthetic-direction)
2. [The epistemic grammar — ink vs pencil](#2-the-epistemic-grammar--ink-vs-pencil)
3. [Token system (`app.css`)](#3-token-system-appcss)
4. [Typography, CJK pairing, spacing, density, surfaces](#4-typography-cjk-pairing-spacing-density-surfaces)
5. [Core components](#5-core-components)
6. [Data visualization specifications](#6-data-visualization-specifications)
7. [App shell and global patterns](#7-app-shell-and-global-patterns)
8. [Route blueprints](#8-route-blueprints)
9. [Svelte 5 component inventory](#9-svelte-5-component-inventory)
10. [Accessibility, motion, responsive rules](#10-accessibility-motion-responsive-rules)
11. [Voice and wording](#11-voice-and-wording)
12. [Validation record](#12-validation-record)
13. [Assumptions and open questions](#13-assumptions-and-open-questions)

---

## 1. Aesthetic direction

### 1.1 The idea

VNDB Explorer is a research desk, not a dashboard. The reader is doing genealogy: reading who worked where, under which name, and deciding whether two things are secretly one thing. The interface is a quiet instrument for that: graphite surfaces, dense tabular type, hairlines instead of boxes, and colour spent only on meaning.

The whole identity hangs on one metaphor that also solves the product's hardest problem:

> **What VNDB states is written in ink. What we infer is written in pencil.**

Ink is solid, cool, upright and checked. Pencil is dashed, warm, hatched and italic. A reader who learns that once can scan any screen and know the epistemic status of every mark without reading a label. Section 2 makes it a strict grammar.

### 1.2 Dark-first, with a real light theme

**Primary theme: dark.** Reasons, in order of weight:

1. **Long sessions in dense tables.** The work is hours of scanning rosters and timelines; a low-luminance ground with calibrated ink (16.4:1 primary, 9.3:1 secondary, 5.7:1 tertiary) is easier to stay in.
2. **Colour reads as signal.** On graphite, a slate-blue check or a sand dashed edge needs very little chroma to stand out, so the palette can stay muted and still separate.
3. **Small CJK text is handled, not ignored.** 12px is the floor for kana and kanji, body weight is 400 with a 500 option for names, and no CJK text is ever set in tertiary ink below 12px.

**Secondary theme: light.** Fully specified, not an inversion: near-white panels on a cool `#F5F6F8` canvas, its own re-stepped hues, validated separately (section 12). Print always uses the light tokens.

### 1.3 Visual signature

| Element | Decision |
|---|---|
| Ground | Graphite canvas `#0F1115`, panels one step lighter `#14171D`. No pure black, no gradients. |
| Structure | Tonal steps and translucent hairlines, not shadows or boxes. Shadows exist only on floating layers (popover, drawer, tooltip). |
| Corners | 4 / 6 / 10 / 14px by the size of the thing. Only person pills are fully round. |
| Type | Inter for everything read; JetBrains Mono for IDs, years, codes and scores. |
| Colour | Chrome is neutral. Colour appears only where it encodes something (section 2.3). |
| The one focal moment | The home question, set large (40/44, weight 600, `-0.025em`) above the search field. Everything else is quiet. |
| Density | High, but with rhythm: 32px rows, 4px grid, generous section gaps (40–56px) between dense blocks. |

Explicitly rejected: neon accents on black, gradient heroes, glassmorphism, identical rounded cards around every block, card-in-card borders, capitals-with-tracking labels above headings, monospace on prose, arrows appended to every link, emoji as icons, coloured headline numbers, rainbow charts, drop shadows as hierarchy, and any "AI insight ✨" framing of inferred results.

### 1.4 Brand mark

A 22px rounded square in ink (radius 7 on a 24 grid) with a three-node tree knocked out in the canvas colour: the top node joined by a solid line to a filled node and by a dashed line to a hollow one. It is the product's grammar as a monogram, it is monochrome, and it is never used for data. The wordmark "VNDB Explorer" follows in Inter 600, 14px, `-0.015em`. `static/favicon.svg` is the same drawing on a fixed graphite square.

---

## 2. The epistemic grammar — ink vs pencil

This section is the contract. Every component in section 5 and every chart in section 6 obeys it.

### 2.1 Two registers

| Channel | **Ink — confirmed in VNDB** | **Pencil — inferred by this tool** |
|---|---|---|
| Source | `producers_relations` rows; alias rows under one `staff.id` | Relationship classifier; potential-alias detector across separate `staff.id` |
| Stroke | Solid | Dashed `6 4` (dotted `1 4` for seiyuu-driven, see 6.2) |
| Border | 1px solid | 1px dashed |
| Fill | Flat tint | Fine 135° hatch over the same tint |
| Hue of the status itself | Slate blue `--confirmed` (cool) | Sand `--inferred` (warm) |
| Glyph | Solid square with a check | Hollow diamond with a `?` |
| Alias glyph | `=` (is the same person) | `≟` (may be the same person) |
| Short label | `VNDB` | `Inferred` |
| Code suffix (graph, tables) | `IMP`, `SUB`, `REN`, `SPN` | `SB?`, `SIS?`, `SUC?`, `PTN?` |
| Verdict text | Upright, declarative: "Imprint of Key" | Italic (Latin only), hedged: "*Likely sub-brand of Key*" |
| Always accompanied by | Link to the VNDB entry | Confidence meter + at least one evidence tag |

### 2.2 Hard rules

1. **No promotion by confidence.** A 99-confidence inference is still dashed, hatched and sand. Confidence changes the meter, never the register.
2. **Never merge.** A potential alias never appears inside a confirmed-alias list, never contributes to the confirmed person's counts, and is never shown as "also known as". It is always a link to a *separate* `staff.id`, framed as a candidate.
3. **Separate ground.** Confirmed and inferred content never share a list. They sit in separate tabs, separate panel zones or separate table sections, each headed by its epistemic caption.
4. **Three redundant channels minimum.** Status is always carried by line style + glyph + label. Hue is a fourth channel, never the only one.
5. **An inference shows its work.** No inferred badge without a reachable evidence breakdown (inline, expandable or one click away).
6. **Wording is part of the encoding.** See section 11.

### 2.3 Colour budget — three palettes, three forms

Colour is scoped by the *shape* it appears on, so the same hue family is never asked to mean two things in one form.

| Palette | Encodes | Appears only as |
|---|---|---|
| **Epistemic pair** (slate blue / sand) | Confirmed vs inferred | Check/diamond glyphs, panel edges, badges and chips, confidence meters, hatch |
| **Relation kind** (4 hues) | Ownership · Sister · Lineage · Partner | Graph edges and relation class badges |
| **Role** (6 hues + neutral) | Staff discipline | Dots, timeline tiles and the dot inside a role pill, always next to a mono code |

Relation hue is shared between registers: an explicit imprint and an inferred sub-brand are both *ownership violet*; the line style tells them apart. This is deliberate — the reader learns four kinds once.

Text never wears a data colour. Names, counts, titles and labels are ink; identity comes from the coloured mark beside them. The only coloured text is the label inside an epistemic badge or chip, and an inferred count set beside its glyph (slate blue or sand, both verified at AA). A title, a zone header, a stat label or a note is never coloured: its glyph and its edge say which register it belongs to.

---

## 3. Token system (`app.css`)

`src/app.css` is the source of truth; this section lists what it defines and why. Raw values live on `:root` (dark, the default) and `[data-theme="light"]`; `@theme inline` exposes them as Tailwind utilities (`bg-canvas`, `text-ink-2`, `border-rule`, `bg-role-scenario`, …). The default Tailwind palette is wiped: only semantic colours exist. A `@media print` block restates the light values, so the printed sheet is white whatever the screen theme. No component holds a colour of its own: `data/review-shots/token_audit.py` fails on any hard-coded colour, undefined `var()` or unknown colour utility under `src/`.

**Surfaces and lines**

| Token | Dark | Light | Use |
|---|---|---|---|
| `canvas` | `#0F1115` | `#F5F6F8` | Page canvas; tables, filters and stat strips sit on it. Also the `theme-color` of the browser chrome |
| `surface` | `#14171D` | `#FFFFFF` | Panels and chart plots |
| `surface-raised` | `#1A1E26` | `#FFFFFF` | Popovers, drawers, autocomplete |
| `surface-sunken` | `#1C2029` | `#EEF0F4` | Tonal fill: table heads, tracks, kbd, quiet chips |
| `surface-hover` | `#232833` | `#E5E8EE` | Row and item hover, bar tracks |
| `selected` | `#2B313D` | `#FFFFFF` | Thumb of a selected segment, current page, active nav item |
| `surface-inverse` / `ink-inverse` | `#F3F5F8` / `#0F1115` | `#14171D` / `#F5F6F8` | Primary button, slot A, skip link |
| `tooltip` / `tooltip-ink` | `#262B36` / `#F3F5F8` | `#1B1F27` / `#F3F5F8` | Chart tooltips: raised, never a glaring inverse |
| `control` / `control-hover` | white 4% / 8% | `#FFFFFF` / `#F3F4F7` | Button, input and chip fills; translucent in dark so they sit on any level |
| `rule` | white 8% | black 8% | Row dividers, panel edges |
| `rule-strong` | white 14% | black 15% | Control borders, axis lines |
| `rule-hover` | white 28% | black 34% | Control border on hover |
| `scrim` | `rgb(4 6 10 / .62)` | `rgb(15 17 21 / .38)` | Behind a drawer |

**Ink**

| Token | Dark | Light | Use |
|---|---|---|---|
| `ink` | `#F3F5F8` | `#14171D` | Titles and everything primary |
| `ink-2` | `#B1BBCD` | `#3B4351` | Subtitles, descriptions, prose |
| `ink-3` | `#8791A3` | `#5F6878` | Quiet meta and micro-labels |
| `ink-4` | `#4B5364` | `#A4ACBA` | Non-text only: empty marks, placeholders for "no value" |

The three readable levels are evenly stepped (OKLab lightness 0.97 / 0.79 / 0.65 on dark, 0.20 / 0.38 / 0.52 on light). `ink-3` is pinned by the hover surface: it is the darkest grey that still clears 4.5:1 on a hovered row (4.6:1 in both themes), so the step between secondary and tertiary was widened by lifting `ink-2` (7.4:1 to 9.3:1 on dark panels), not by dimming `ink-3`. A dimmer `#7D8799` was measured and rejected: 4.5:1 on the tonal fill and 4.1:1 on hover.

**The ink rule.** One job per level, the same on every route:

| Level | Carries |
|---|---|
| `text-ink` | `h1`; `SectionHeader` headings; the title of an `EpistemicZone` or of a verdict half; card titles; an entity's primary name; a primary verdict, confirmed (upright) or inferred (italic); stat values |
| `text-ink-2` | Page leads; a `SectionHeader` or `EpistemicZone` note; the second script under a stacked `NamePair`; `RichText`; alert and empty-state prose; chart legends; a value that qualifies a title |
| `text-ink-3` | Stat tile labels and sub-lines; kickers above a title; small sub-headings (`Developed by`, `Co-developed visual novels`, the column heads of `MigrationFlow`); table `th`; control labels; the inline second script; IDs, dates, counts and helper captions |
| `text-ink-4` | Never text: the `—` of an empty cell, a disabled icon, an unfilled pip |

**Meaning**

| Token | Dark | Light | Use |
|---|---|---|---|
| `confirmed` (+ `-tint` 7%) | `#86ACEA` | `#31559A` | VNDB's record: the check glyph, solid edges, badge and chip text |
| `confirmed-edge` | 38% of `confirmed` | 38% of `confirmed` | Border of a confirmed zone: a quiet solid edge |
| `inferred` (+ `-tint` 6% / 8%) | `#D8B982` | `#77581C` | Inference: the diamond and `≟` glyphs, dashed edges, badge and chip text |
| `inferred-edge` | 50% of `inferred` | 64% of `inferred` | Dashed border of an inferred zone, set per theme so it lands on 3.0:1 against the panel in both (v2.0: 62% of amber, 3.6:1 and 2.8:1) |
| `inferred-mark` | `#C9A96E` | `#936D24` | Meter fill and hatch stroke (the hatch is 13% of it, 1px in 8) |
| `rel-ownership` · `sister` · `lineage` · `partner` | `#827ECC` · `#66C3CF` · `#BE6866` · `#C9E08C` | `#403C83` · `#057D82` · `#6B3443` · `#5C6721` | Graph edges and class badges |
| `role-director` · `scenario` · `chardesign` · `art` · `music` · `seiyuu` · `other` | `#C97B60` · `#4683C5` · `#E0A1B6` · `#B19BEB` · `#E2E180` · `#76E1EC` · `#8791A3` | `#9F322F` · `#1D6EB1` · `#9F526F` · `#53437B` · `#8E7C1A` · `#015255` · `#727B8C` | Role marks only |
| `alias-high` · `medium` · `speculative` | `#EBCD95` · `#B79A64` · `#8A703F` | `#5B4315` · `#876114` · `#9F7932` | Ordinal tier ramp in the sand hue; brightest is most confident on dark, darkest on light |
| `cmp-a` · `cmp-b` | `#C3CAD6` · `#7A8496` | `#454D5C` · `#778191` | Compare bars: neutral pair, position and slot tags do the work |
| `danger` | `#F08277` | `#B42318` | Errors only |
| `focus` | `#7DB4FF` | `#2F6FED` | 2px focus ring, 2px offset |

The register hues are spent on marks, not on headings: glyph, edge, badge, meter, hatch. Text in `confirmed` or `inferred` exists only inside a badge or chip and on an inferred count that follows its glyph.

**Shape and type**

| Token | Value |
|---|---|
| `radius-xs` · `sm` · `md` · `lg` · `pill` | 4 · 6 · 10 · 14 · 9999 |
| `font-sans` | Inter, Noto Sans JP (swapped per `:lang()` for zh / ko), system sans |
| `font-mono` | JetBrains Mono, CJK sans, system mono |
| `tracking-tight` · `tracking-tighter` | `-0.015em` · `-0.025em` (reset to 0 on CJK text) |
| `shadow-pop` · `shadow-drawer` | Floating layers only |

**Utilities defined in `app.css`:** `tnum`, `caption`, `hatch-inferred`, `hatch-muted`, `link`, `link-quiet`, `sheet`, `btn` (`btn-primary`, `btn-sm`, `btn-ghost`), `field`, `ledger`, `scroll-x`, `tab-strip`; component classes `.zone-confirmed`, `.zone-inferred`, `.fchip`, `.skeleton`, `.refetch-bar`. A disabled button of any kind is a tonal fill with tertiary ink (5.1:1), never the inverse fill behind dimmed text.

---

## 4. Typography, CJK pairing, spacing, density, surfaces

### 4.1 Faces and their jobs

| Face | Token | Used for | Never for |
|---|---|---|---|
| **Inter** (+ Noto Sans JP) | `font-sans` | Everything read: names, headings, body, tables, controls, chart labels, stat values, hedged verdicts (italic) | — |
| **JetBrains Mono** | `font-mono` | VNDB IDs (`p42`, `s1`, `v17`), years and year ranges, role codes, relation codes, confidence scores, tabular counts, search-syntax examples | Running text, labels, notes |

Why this pair: one family keeps mixed Latin / kana / kanji rows at a consistent weight and removes the serif-versus-sans switch between a name and its data. Inter is chosen over the other candidates because it ships true italics, and italic is a load-bearing channel here (the hedged verdict of an inference); a synthesised oblique would weaken it. Mono is a marker for "this is an identifier or a figure", so it is kept off prose: `4,807 unlinked pairs` is sans with tabular figures, `p24` is mono.

Weights loaded: Inter 400, 500, 600, 700 and italic 400, 500; Noto Sans JP 400, 500, 700; JetBrains Mono 400, 500 (no 600: mono figures use 500 at most). `tnum` is applied wherever digits must align vertically.

### 4.2 Scale and use

| Token | Size / line | Weight · tracking | Use |
|---|---|---|---|
| `text-3xl` | 40 / 44 | 600 · `-0.025em` | Home question only |
| `text-2xl` | 30 / 36 | 600 · `-0.025em` | Entity name in the identity header; page titles |
| `text-xl` | 24 / 30 | 600 · `-0.015em` | Stat tile value |
| `text-lg` | 19 / 26 | 600 · `-0.015em` | Section heading; drawer title |
| `text-md` | 16 / 24 | 600 names · 500 statements · 400 lead | Panel titles; verdict sentences; original-script line under an entity name |
| `text-base` | 14 / 22 | 400 | Body, controls, list rows |
| `text-sm` | 13 / 20 | 400 | Table cells, chips with names |
| `text-xs` | 12 / 16 | 400–500 | Meta, badges, evidence tags, column heads, captions; **smallest size allowed for CJK** |
| `text-2xs` | 11 / 16 | sans 400 / mono 500 | Axis ticks, IDs, codes; Latin and digits only |

Labels are sentence case at every size. Column heads are 12px, weight 500, tertiary ink on the tonal fill. Line length for prose (descriptions, verdict explanations): 42rem.

### 4.3 The name pairing pattern

VNDB stores `name` (original script) and `latin` (romanisation, `NULL` when the name is already Latin). Titles work the same way (`vn_titles.title` / `.latin`). One component, `NamePair`, renders every such pair.

Resolution:

```
primary   = latin ?? name          // what most readers search and sort by
secondary = latin ? name : null    // original script, only if different
lang      = record language        // producers.lang, staff.lang, vn_titles.lang
```

A reader preference in the top bar, **Name order: Romanised first / 原文 first**, swaps primary and secondary everywhere. Default is romanised first.

Three layouts:

| Variant | Where | Rendering |
|---|---|---|
| `stacked` | Identity headers, drawer titles | Line 1: primary, `font-display text-2xl`. Line 2: secondary, `font-display text-md text-ink-2`, 4px below. |
| `inline` | Table cells, list rows, pills | `Primary` in ink, then a 6px gap, then secondary in `text-ink-3` at `0.92em` (CJK looks larger than Latin at the same size). One line, secondary truncates first. |
| `compact` | Graph labels, timeline lane labels, tight chips | Primary only; secondary moves to the tooltip and `title`. |

Rules:

- The span holding original-script text always has `lang` set and carries the font utility, so the right Han glyph variant and CJK stack are chosen.
- Never italicise, letter-space or uppercase original-script text.
- Never truncate the primary to fewer than 8 characters; drop the secondary instead.
- Sorting uses the primary; search matches both plus every alias.
- IDs are shown as a mono suffix in `text-ink-3` (`p42`) wherever disambiguation matters: search results, compare pickers, alias candidate cards, table rows on hover.

**Alias-used pattern.** When a credit was made under an alias that is not the person's primary name, show the alias as the credited name and the primary as the identity:

```
Primary Name 原名   as  [ Alias Latin 別名 ]
```

`as` is an eyebrow-style mono tag; the alias sits in a thin solid-bordered chip (it is a *confirmed* alias, so solid ink). If the credit used the primary name, nothing extra is drawn. This one pattern is reused in rosters, the compare matrix (twice per row), VN credits and timeline tooltips.

### 4.4 Spacing and density

4px base grid. Three density modes, switchable per table and remembered per user:

| Mode | Row height | Cell padding x | Text | Default for |
|---|---|---|---|---|
| Compact | 28px | 8px | `text-sm` | `/discover/*` tables on wide screens |
| Regular | 32px | 12px | `text-sm` | Rosters, credits, matrices |
| Comfortable | 40px | 12px | `text-base` | Touch and narrow screens |

Vertical rhythm: 8px inside a group, 16px between related groups, 24px card padding, 40px between page sections (56px at `xl`). Page gutters: 16px mobile, 24px `md`, 32px `lg`+. Content max width `--container-page` (1440px), 12-column grid, 24px gutters.

### 4.5 Surface hierarchy

Depth comes from tone and hairlines, not shadow.

| Level | Token | Border | Use |
|---|---|---|---|
| 0 Canvas | `canvas` | — | Page background. Data tables, filter bars, stat strips and plain lists sit directly on it, structured by a tonal head row and `rule` hairlines. |
| 1 Panel | `surface` | 1px `rule`, radius 10 | Discrete objects only: chart cards, the verdict, epistemic zones, home quick-jump modules, the shared-people matrix. A zone's edge carries its register (solid `confirmed-edge`, or dashed `inferred-edge`); its title is ink. |
| 1b Tonal fill | `surface-sunken` | none | Table head row (radius 6 at the ends when on the canvas), tracks, kbd, evidence tags |
| 2 Float | `surface-raised` | 1px `rule-strong` + `shadow-pop`, radius 14 | Autocomplete, popovers |
| 2b Tooltip | `tooltip` | 1px `rule-strong` + `shadow-pop`, radius 6 | Chart tooltips |
| 3 Drawer | `surface-raised` | 1px `rule-strong` + `shadow-drawer`, radius 14 at `lg` | Detail drawers, over a `scrim` |
| Selected | `selected` | 1px inset `rule-strong` | Thumb of a segmented control, current page, active nav item, pressed filter chip |
| Inverse | `surface-inverse` | — | Primary button and slot A only |

Rules: never a panel inside a panel; one radius per level; a section header is a `text-lg` heading above one `rule` hairline, with an optional count in mono and right-aligned controls. All four relation hues and all seven role hues clear 3:1 on the canvas as well as on panels (section 12), so data marks may sit on either.

---

## 5. Core components

All sizes in px. "Hue" means the relevant palette token; text is always ink unless stated.

### 5.1 `EpistemicBadge`

The smallest statement of register. Height 18, padding x 6, radius 2, `text-2xs` weight 600, tracking eyebrow.

| Variant | Look | Text |
|---|---|---|
| `confirmed` | `bg-confirmed-tint`, 1px solid `confirmed` border, 10px filled-seal glyph, text in `confirmed` | `VNDB` |
| `inferred` | paper background + `hatch-inferred`, 1px dashed `inferred` border, 10px hollow-diamond glyph, text in `inferred` | `INFERRED` |

Both glyphs are inline SVG in `EpistemicGlyph`, not font characters.

### 5.2 `RelationBadge` (class and explicit type)

Height 20, padding x 8, radius 2, `text-xs` weight 500, ink text, 12px kind icon in the hue.

| Kind (hue) | Explicit — solid border, 12% tint | Inferred — dashed border, hatch in the hue at 20% |
|---|---|---|
| Ownership (violet) | `Parent producer` `Subsidiary` `Parent brand` `Imprint` | `Sub-brand / Imprint?` |
| Sister (teal) | `Sister (shared parent)` — only for the 2-hop explicit case | `Sister brand?` |
| Lineage (crimson) | `Formerly` `Succeeded by` `Spawned` `Originated from` | `Successor / Spinoff?` |
| Partner (olive) | — (VNDB has no partner relation) | `Co-dev partner?` |

Icons (16px grid, 1.5px stroke): ownership = nested squares; sister = two circles joined by a bar above; lineage = branching arrow; partner = interlocking rings. Inferred labels end in `?` and are never shown without an adjacent `ConfidenceMeter`.

Direction for explicit ownership and lineage is shown with a leading arrow glyph in the label: `↑ Parent brand`, `↓ Imprint`, `← Formerly`, `→ Succeeded by`.

### 5.3 `ConfidenceMeter`

One language for every inferred score, always in the persimmon family.

```
 82  ▮▮▮▮▯        High
```

- Score: mono, `tnum`, `text-xs`, ink, right-aligned in a 3-character box.
- Bar: 5 segments, each 8×6, 2px gaps, radius 1. Filled = `inferred-mark`; unfilled = `inferred-tint` (a lighter step of the same ramp, so the track belongs to the meter). Filled count = `ceil(score / 20)`.
- Optional tier word in `text-xs text-ink-2`.
- Dense variant for tables: segments 6×4, no tier word.
- `aria-label="Confidence 82 of 100, high"`.

Tier thresholds (shared by brands and aliases so the words always mean the same thing). They are defined once, as `CONFIDENCE_TIER_MIN` in `src/lib/relations.ts`; the ETL stores tiers with it and the meter falls back to it:

| Tier | Score | Segments | Alias token |
|---|---|---|---|
| High | 72–100 | 4–5 | `alias-high` |
| Medium | 48–71 | 3–4 | `alias-medium` |
| Speculative | below 48 | 1–3 | `alias-speculative` |
| Below 25 | hidden by default; revealed by a "Show weak signals" filter and then drawn at 60% opacity |

### 5.4 `PotentialAliasBadge` and `ConfirmedAliasBadge`

| | Confirmed alias | Potential alias |
|---|---|---|
| Glyph | `=` in `confirmed` | `≟` in the tier colour |
| Body | solid 1px `rule-strong` border, `surface` fill | dashed 1px `inferred` border, `hatch-inferred` |
| Text | the alias name itself | `Potential alias` + tier word |
| Left edge | none | 3px block in the tier colour (ordinal: darker = more confident in light theme) |
| Target | — | always links to the *other* `staff.id`, shown as mono ID |

Compact indicator for rosters and credits (`PotentialAliasFlag`): a 16px hollow diamond with `≟`, dashed border in the tier colour, plus a count if more than one candidate (`≟ 2`). Tooltip: "*Possibly the same person as* Name (s12345) — Medium. Not confirmed in VNDB." Click opens the candidate comparison drawer.

### 5.5 `EvidenceTag`

Evidence is a fact that supports an inference, so the tag itself is neutral, not persimmon. Height 20, padding x 6, radius 2, `bg-surface-sunken`, `text-xs`, 12px icon in `ink-3`, optional value in mono, and 1–3 strength pips (3px dots, `ink-2` filled / `ink-4` empty) at the right edge.

Brand evidence types:

| Key | Label pattern | Icon |
|---|---|---|
| `shared_staff` | `Shared staff 14 (wt 9.2)` | two people |
| `containment` | `Containment 78% of A` | nested circle |
| `timeline` | `Concurrent 2004–2011` · `Sequential, 1y gap` · `Handoff 2009` | parallel / staggered bars |
| `shared_series` | `Shared series ×2` | stacked books |
| `shared_link` | `Same website domain` · `Same publisher account` | chain |
| `co_release` | `Co-credited releases ×5` | split disc |
| `explicit_2hop` | `2 hops via Parent (p123)` | path |
| `name_stem` | `Name stem match` | text cursor |

Alias evidence types:

| Key | Label pattern |
|---|---|
| `shared_character` | `Shared character across releases ×3` |
| `shared_extlink` | `Shared external link` |
| `bio_xref` | `Bio cross-reference` |
| `name_overlap` | `Name match + studio overlap` |
| `complementary_timeline` | `Never co-credited, same studios` |
| `same_role_brand` | `Same role at ×4 brands` |

Every tag is a button: clicking opens the underlying rows (the VNs, the link, the bio sentence with the reference highlighted). An inference whose evidence cannot be opened is a bug.

### 5.6 `RolePill` and role marks

Pill: height 18, padding x 6, radius 2, `bg-surface-sunken`, `text-2xs` mono weight 500 ink. Leading mark 8px in the role hue.

| Role (VNDB `credit_type`) | Code | Token | Mark shape | Group |
|---|---|---|---|---|
| `director` | `DIR` | `role-director` | square | Core |
| `scenario` | `SCN` | `role-scenario` | square | Core |
| `chardesign` | `CHD` | `role-chardesign` | square | Core |
| `art` | `ART` | `role-art` | square | Core |
| `music` | `MUS` | `role-music` | square | Core |
| `songs` | `SNG` | `role-music` | square, hollow | Core (low weight) |
| seiyuu (`vn_seiyuu`) | `CV` | `role-seiyuu` | **circle** | Seiyuu |
| `staff`, `translator`, `editor`, `qa` | `ETC` / `TL` / `ED` / `QA` | `role-other` | square, outlined only | Other |

Shape is the Core-vs-Seiyuu channel everywhere: **squares are development credits, circles are voice credits.** That holds in pills, timelines, rosters, matrices and legends.

Discipline pill for identity headers (`DisciplineBadge`): `Core Dev` (square glyph, ink outline), `Seiyuu` (circle glyph, seiyuu hue outline), or `Dual` (both glyphs side by side). Height 22, `text-xs` weight 600.

### 5.7 `PersonPill`

The clickable person token used in previews, flows and collaborator lists. Height 24, radius pill, 1px `rule-strong`, `surface`, padding x 8: role mark (8px) · `NamePair inline` · optional mono years `2004–07` · optional `PotentialAliasFlag`. Hover: border `ink`. Seiyuu pills use the circle mark, so a mixed list scans by shape.

### 5.8 `ProducerTypeBadge`, language, counts

- Type: mono `text-2xs` in a 1px `rule-strong` box, 18 high: `CO` company · `NG` amateur group · `IN` individual. Full word in the tooltip and in identity headers (`Company · CO`).
- Language: mono lower-case code (`ja`, `en`, `zh-Hans`) in `ink-3`; no flags.
- `StatInline`: `value` in sans 600 ink + `label` in `ink-3`, separated by a 4px gap; items separated by a middle dot. Used in headers: `132 VNs · 418 staff · 291 seiyuu · 1999–2024`.
- `YearSpan`: mono `tnum`, en dash, two-digit end year when same century in tight spaces (`1999–2024`, `2004–07`). An ongoing span ends with `–` and a 4px dot.

### 5.9 `MobilityIndicator`

Three ascending bars (3×4, 3×7, 3×10, 1px gaps), filled `ink-2` up to the level, the rest `ink-4`:

| Level | Meaning | Bars |
|---|---|---|
| Anchored | 1–4 brands | 1 |
| Mobile | 5–15 brands | 2 |
| Itinerant | 16+ brands | 3 |

One definition, `MOBILITY_THRESHOLDS` in `src/lib/roles.ts`: the indicator, the Compare mobility filter and the classifier's "low-mobility" weight all read it.

Followed by mono `×12` (brand count). When the current lens caps a person out of overlap maths, the row gets `hatch-muted`, 60% opacity and a `capped` mono tag: excluded people stay visible so the reader can see what the cap removed.

### 5.10 Controls

- **Buttons.** Height 32 (28 compact). Primary: `surface-inverse` fill, inverse ink. Secondary: `surface`, 1px `rule-strong`. Ghost: text only, underline on hover. Radius 3. No coloured buttons.
- **Segmented control.** 1px `rule-strong` box, items divided by hairlines, selected item inverse. Used for register tabs, view switches, density.
- **Filter chip.** Height 28, radius 2; idle = `surface` + rule; active = inverse; shows a count in mono.
- **Lens toggle** (section 7.3): a labelled switch group, always showing its current state in words.
- **Links.** Ink with a 1px underline in `rule-strong`, offset 3px; hover underline `ink`. External links add a 10px north-east arrow. Entity links inside tables are not underlined until hover (the whole name is the target).
- **Tabs.** Text tabs on a `rule-strong` baseline; active tab has a 2px ink underline and ink text, others `ink-3`. Tabs that hold inferred content carry the hollow-diamond glyph before the label; confirmed tabs carry the seal glyph.

---

## 6. Data visualization specifications

Shared rules for every chart:

- Plots sit on a `surface` card. Axes and gridlines are solid 1px `rule` hairlines; decade lines `rule-strong`. **Gridlines are never dashed — dashes are reserved for inference.**
- Axis ticks: mono `text-2xs`, `tnum`, `ink-3`.
- Marks are thin. Touching fills are separated by a 2px `surface` gap; overlapping markers get a 2px `surface` ring. No strokes around marks for separation.
- Every chart has a legend when it uses more than one encoding, a hover/focus tooltip (`surface-inverse`, values first), and a table-view twin reachable from a `Table` toggle in the card header.
- Tooltips never gate information; the same values are in the table view.
- On refetch (filter or lens change) the chart holds its previous render at 60% opacity; no skeleton flash.
- One scale per chart. No dual axes anywhere.

### 6.1 Career timeline across brands (`CareerTimeline`)

The centrepiece of `/staff/[id]`. A swimlane chart: time runs left to right, each lane is a brand.

**Geometry**

```
            1999   2001   2003   2005   2007   2009   2011   2013
 ALIAS      ├─ 山田太郎 ──────────────┤⇄├─ YAMADA ───────────────────┤
 ───────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────
 Brand A    │ ■ ■  ■■ ■   ■                                          │  6 VNs
 as 山田太郎  │▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔╲                                         │
 Brand B    │                ╲▶ ■ ■■  ■  ■                           │  7 VNs
 as 山田太郎  │                  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔╲                        │
 Brand C    │                               ╲▶ ⇄■ ■ ■■ ■  ■         │  8 VNs
 as YAMADA  │                                 ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔       │
 Brand D    │                     ●   ●                 ● ○          │  4 VNs · CV
```

| Part | Spec |
|---|---|
| Lane label column | 208px, sticky left, `surface`. Line 1: brand `NamePair compact`, `text-sm` weight 500, links to `/producer/[id]`. Line 2: `as <alias>` in mono `text-2xs` when the alias used at this brand differs from the primary name; several aliases are comma-separated. Right edge: VN count, mono. |
| Lane order | By year of first credit, earliest on top. Ties: more credits first. Sort control offers `First appearance` (default), `Most credits`, `Longest tenure`. |
| Lane height | 36px (28 compact). Lanes divided by `rule` hairlines. Alternate lanes are not zebra-striped. |
| Tenure track | A 4px-high bar in `surface-sunken`, radius 2, from first to last credit at that brand, on the lane's lower third. It is the "stint" the tiles sit above. |
| X axis | Linear years from first credit minus 1 to last credit plus 1. Target 28px per year; minimum 14px, below which the plot scrolls horizontally with the label column pinned. Ticks every year when ≥ 28px, else every 2 or 5. Axis repeated at the bottom when there are more than 12 lanes. |
| Date used | Earliest release date of the VN with a `complete` or `partial` release; trial-only VNs use the trial date and are drawn at 60% opacity. Unknown dates go in a separate "undated" gutter at the right. |

**Credit marks**

| Case | Mark |
|---|---|
| Core credit, one role | 12×12 square, radius 2, filled with the role hue |
| Core credit, two roles | Same tile split horizontally 50/50 with a 1px `surface` gap; higher-precedence role on top (director > scenario > chardesign > art > music > other) |
| Core credit, three or more roles | Tile filled with the top-precedence role plus a 4×1px ink tick centred above it; full list in tooltip and table |
| `songs` credit | Hollow square, 1.5px stroke in `role-music` |
| Other credit | Hollow square, 1.5px stroke in `role-other` |
| Seiyuu, main or primary character | 12px filled circle, `role-seiyuu` |
| Seiyuu, side or appears | 12px ring, 1.5px stroke, `role-seiyuu` |
| Credited under a non-primary alias | A 12×2px ink underscore, 2px below the mark |
| Same lane, same year | Marks stack upward with 2px gaps, up to 2 rows; a third or later becomes a count tile: 16×12 `surface-sunken` with a mono number. Zooming or clicking expands it. |

A person with both core and seiyuu credits at one brand gets two sub-rows inside that lane (squares above, circles below), so the dual career is visible at a glance.

**Alias strip and switch markers**

- A 20px strip above the lanes, labelled `ALIAS` in the label column. Each alias is a horizontal segment from its first to last use: 1px solid `ink-2` outline (solid because these are confirmed aliases), `surface` fill, alias name inside in `text-2xs` sans, clipped with ellipsis; segments that overlap in time stack in rows.
- **Switch marker:** where the alias on a credit differs from the alias on the chronologically previous credit, draw a 7px ink diamond (2px `surface` ring) on the alias strip at that date and a 1px solid `ink-4` vertical guide down through the lanes. A switch that coincides with a change of brand is the interesting case: the diamond is repeated on the transition connector and the tooltip reads "Switched name with studio: 山田太郎 → YAMADA".
- A person with a single name shows no strip.

**Transition connectors**

- Drawn between consecutive stints in different lanes: from the last mark of stint A to the first mark of stint B. Path: cubic S-curve, 1.5px, `ink-3` at 55% opacity, 5px arrowhead at B.
- To avoid spaghetti, the default shows only *first arrivals* at each brand (one connector per lane, tracing the A → B → C path). A `Show all transitions` toggle adds returns and back-and-forth moves at 30% opacity.
- Hover or focus: the connector goes to `ink` at full opacity, both lanes highlight (lane background `surface-sunken`), tooltip shows `Brand A → Brand B · 2006 → 2007 · gap 1y · with 3 co-movers`.
- Connectors are solid: they are observed facts (ordering of credits), not inferences.

**Potential-alias overlay (investigative mode)**

A control in the card header, `Overlay candidate ▾`, lists this person's potential aliases. Choosing one draws the candidate's credits on the same axes as **hollow marks with a dashed 1.5px `inferred` outline**; lanes that only the candidate occupies get a `hatch-inferred` background and a `candidate only` tag. This shows the two patterns that matter: careers that interleave without ever sharing a release, and identical studio sequences. The legend gains a `Candidate s12345 (potential alias)` row, and a persimmon-ruled banner above the chart states: "*Overlay shows a separate VNDB record. Not confirmed as the same person.*"

**Legend** (below the plot, one row, wraps)

```
■ DIR  ■ SCN  ■ CHD  ■ ART  ■ MUS  □ SNG  □ ETC   ● CV main  ○ CV side
▁ credited under an alias   ⇄ name switch   ╲▶ move between brands   ▬ tenure
```

Role entries are also filter toggles (click to isolate, shift-click to add). Colour follows the role, never the filter state: hiding a role does not repaint the others.

**Interaction**

- Pointer: a vertical 1px `ink-4` crosshair snaps to the year; each mark has a 24px hit area.
- Tooltip (values first): VN title `NamePair`, release date, role pills, `as <alias>` if not primary, brand, age rating tag if 18+.
- Click a mark → `/vn/[id]`. Click a lane label → `/producer/[id]`.
- Brush on the axis to zoom; double-click to reset. `+` / `−` buttons for keyboard and touch.
- Keyboard: the plot is one tab stop; arrow keys move mark to mark in time order, `Home`/`End` jump, `Enter` opens.

**Sizes and responsive**

- Height = 20 (alias strip) + 24 (axis) + lanes × 36 + 32 (legend). More than 14 lanes: show the top 14 by credits and a `Show all 31 brands` expander; the collapsed remainder is one `Other brands (17)` lane of count tiles.
- Below `md` (896px) the swimlane is replaced by `CareerStintList`: a vertical, chronological list of stints (brand, `YearSpan`, role pills, alias used, VN count), with a 2px ink spine on the left, connector labels between stints (`↓ moved 2007, 1y gap`), and switch diamonds on the spine. Same data, same order.

### 6.2 Brand relationship graph (`RelationGraph`)

An ego graph around one producer. Deterministic, not a free force simulation: the same brand always produces the same picture, and position itself carries meaning.

**Compass layout**

```
                     N  owners / parents
                            ▲
        NW  sisters   ╲     │     ╱   NE  sisters
                        ╲   │   ╱
   W  predecessors ◀────── FOCUS ──────▶  E  successors / spinoffs
                        ╱   │   ╲
        SW  partners  ╱     │     ╲   SE  partners
                            ▼
                     S  sub-brands / imprints / subsidiaries
```

- Vertical axis = ownership (who is above whom). Horizontal axis = time and lineage (what came before, what came after). Diagonals hold the symmetric kinds: sisters toward the parent side, partners toward the child side.
- Ring 1 (radius 38% of the short side): direct relations. Ring 2 (radius 76%): relations of ring-1 nodes, off by default, toggled by `Depth 1 | 2`; drawn at 50% opacity.
- Within a sector, nodes are ordered by confidence (inferred) or VN count (explicit) and spread evenly; a short collision-only relaxation (no attraction forces, ≤ 60 ticks, run before first paint) separates labels.
- Sector capacity 8 per ring; overflow collapses into an aggregate node `+12` that opens the relations list filtered to that sector.

**Nodes**

| Property | Spec |
|---|---|
| Size | Radius `clamp(6, 4 + 1.6·√vnCount, 26)`. Focus node: at least 22, with a second 1.5px ink ring at +4px. |
| Shape | By producer type: `co` circle · `ng` rounded square (radius 25%) · `in` diamond |
| Fill / stroke | `surface` fill, 1.5px `ink` stroke. Nodes are monochrome; colour belongs to edges. |
| Label | `NamePair compact`, `text-xs` weight 500, below the node, max 14 characters then ellipsis; a `surface` halo (3px stroke) keeps it legible over edges. Ring-2 labels appear on hover only. |
| Inactive brand | Last release more than 10 years ago: stroke `ink-3`, label `ink-3`. |

**Edges**

| Property | Explicit (VNDB) | Inferred | Inferred, seiyuu-driven |
|---|---|---|---|
| Dash | Solid | `6 4` | `1 4`, round caps |
| Width | 2px | 1.5px | 1.5px |
| Colour | Relation-kind hue | Relation-kind hue | Relation-kind hue |
| Opacity | 100% | `0.45 + 0.55 × confidence/100` | same |
| Mid-edge code | `IMP` `SUB` `PAR` `REN` `SPN` | `SB?` `SIS?` `SUC?` `PTN?` | same, plus a 5px circle |

- "Seiyuu-driven" means the edge only clears the display threshold when voice-cast overlap is counted. These edges exist only while the Seiyuu lens is on.
- Direction: ownership and lineage edges carry a 6px arrowhead pointing to the child or the successor. Sister and partner edges have none.
- Renamed (`old`/`new`) is drawn as a **double** solid line (two 1.5px strokes, 2px apart) in the lineage hue: the two nodes are the same entity under two names.
- When a pair has both an explicit and an inferred relation, both are drawn as parallel curves offset 3px either side, solid above dashed. An inference that merely agrees with VNDB is drawn at 35% opacity and marked "corroborates VNDB" in the inspector.
- Mid-edge labels: whole words (`Imprint`, `Renamed`, `Sister?`), never abbreviations, in mono `text-2xs` on a `surface` chip, shown for ring-1 edges when the edge is at least 72px long; otherwise on hover.
- Edges curve slightly (quadratic, 8% bow) so parallel pairs and labels do not overlap.

**States**

| State | Treatment |
|---|---|
| Hover / focus node | Node stroke 2.5px; incident edges full opacity; everything else 20% opacity; ring-2 label appears. |
| Hover / focus edge | Edge +1px width; both endpoint nodes emphasised; evidence popover anchored at the midpoint. |
| Selected (click) | 2px `ink` ring at +3px with a 2px `surface` gap; the inspector panel fills. Selection persists until `Esc` or a click on empty canvas. |
| Navigate | Double-click, or `Enter` on a focused node, or the `Open` button in the inspector. |

**Evidence popover (edge):** `RelationBadge` + `EpistemicBadge`, `ConfidenceMeter` (inferred only), up to three `EvidenceTag`s, and two actions: `Compare A vs B` and `Open brand`. For explicit edges: the VNDB relation name and a link to the VNDB producer page.

**Filter row** (above the canvas, one row, never inside it):

```
Show  [■ VNDB explicit ✓] [◇ Inferred ✓] [● Seiyuu-driven ○]   Kind [Ownership][Sister][Lineage][Partner]
Min confidence [──●────] 50      Depth [1|2]      [Reset layout]            [Graph | Table]
```

**Legend** (inside the card, bottom-left, `surface` at 92% opacity, 1px `rule`):

```
──── VNDB explicit     ┄┄┄┄ Inferred     ····· Inferred, seiyuu-driven     ════ Renamed
━ Ownership   ━ Sister   ━ Lineage   ━ Partner          (four hue swatches)
○ Company   ▢ Amateur group   ◇ Individual      ◯ ○ · node size = VN count
```

**Rendering and size.** SVG up to 150 nodes and 300 edges, canvas beyond that (same geometry, hit-testing by quadtree). Card aspect 16:10, minimum height 420, maximum 720. Pan by drag, zoom by wheel with a modifier key or pinch; `Reset layout` restores the fit.

**Accessibility.** The `Table` toggle swaps the canvas for the same relations as a sortable list (target, kind, register, confidence, top evidence). Keyboard in the graph: `Tab` enters at the focus node; arrow keys move to the nearest node in that direction; `E` cycles incident edges; `Enter` opens.

**Below `md`:** the graph is replaced by the table view, with a `Show graph` button that opens it full-screen in landscape-friendly layout.

### 6.3 Staff migration flow (`MigrationFlow`)

Answers: where did this brand's people work before they first appeared here, and where did they go after their last credit here?

**Structure:** three columns, time flowing left to right.

```
  CAME FROM (before first credit here)        THIS BRAND          WENT TO (after last credit here)
  ───────────────────────────────────       ┌──────────┐        ─────────────────────────────────
  Brand P  ◇SB?      18  −2y ═════════╗     │          │    ╔═════════ 21  +1y   Brand X  ■IMP
  Brand Q            11  −4y ══════╗  ║     │  Brand   │    ║  ╔══════ 12  +3y   Brand Y
  Brand R             7  −1y ════╗ ║  ║     │   Name   │    ║  ║ ╔════  6  +2y   Brand Z  ◇SUC?
  Other (23 brands)  31      ══╗ ║ ║  ║     │          │    ║  ║ ║ ╔══ 28        Other (19 brands)
  ░ Debuted here     64      ░░║░║░║░░║░    │ 418 staff│    ║  ║ ║ ║░░ 97        ░ No later credits
                                            │ 1999–2024│                  44     ▪ Still active here
                                            └──────────┘
```

| Part | Spec |
|---|---|
| Definition of a move | For each person: the brand of their most recent credit *before* their first credit here is their source; the brand of their first credit *after* their last credit here is their destination. One source and one destination per person, so ribbons sum to the head count. A `Count all prior/later brands` switch changes this to multi-membership and relabels the totals. |
| Rows | Top 8 brands per side by people, then `Other (n brands)`. Three honest residual buckets, always shown when non-zero: `Debuted here` (no earlier credits), `No later credits`, `Still active here` (credit within the last 3 years). Residuals are drawn with `hatch-muted` so they read as "not a flow to another studio". |
| Centre pillar | 96px wide, `surface-sunken`, 1px `rule-strong`, height proportional to total people (min 160, max 480). Brand name set vertically is avoided; instead the name, total and `YearSpan` are stacked horizontally-set text, centred. |
| Ribbons | Thickness proportional to people (1 person = 2px, scaled so the largest side fits the pillar). Cubic paths from row to pillar. Fill `ink` at 14%, no stroke, 2px `surface` gap between adjacent ribbons at both ends. One neutral colour: this chart shows magnitude, not categories. |
| Core / seiyuu split | With the Seiyuu lens on, each ribbon is two stacked bands: core in `ink` 14% on the outer side, seiyuu in `role-seiyuu` 26% on the inner side, 1px `surface` gap. The row count shows both: `18 · 6 CV`. |
| Row label | Brand `NamePair inline`, `text-sm`. If that brand has a relation with this one, a `RelationBadge` in dense form follows (solid or dashed, per register). |
| Count | Mono `tnum`, weight 600, nearest the ribbon. |
| Year delta | Mono chip: median years between leaving the source and arriving here (`−2y`), or between leaving here and arriving at the destination (`+1y`). `0y` is shown as `same yr`. Hover shows the range (`min −7y · max 0y`). |
| Alignment | Left rows are right-aligned to the ribbons, right rows left-aligned; the two sides mirror. |

**Interaction**

- Hover or focus a row: its ribbon goes to `ink` 34%, others drop to 6%; tooltip lists the top five people.
- Click a row: a `PersonPill` drawer opens directly under the diagram, titled `Brand P → This Brand · 18 people`, with pills sorted by year of move, each showing role mark, name and the two boundary years (`2004 → 2006`). Pills link to `/staff/[id]`. A `Compare Brand P vs This Brand` button sits at the right.
- Role filter chips above the diagram (the page-level lens) re-weight every ribbon.

**Table twin:** two tables (Came from / Went to): brand, relation, people, core, seiyuu, median delta, range.

**Below `md`:** the ribbons are dropped. Two stacked ranked lists, each row a brand with a thin 4px segmented bar (core + seiyuu) and the count and delta; tapping a row expands the person pills.

### 6.4 Side-by-side activity timeline (`CompareTimeline`)

For `/compare`. A mirrored chart with one shared scale, so it is not a dual-axis chart.

```
 releases/yr
   12 ┤        ▂▅▇▆▅▃▂                                            Brand A ▲
    6 ┤   ▁▂▃▅▇███████▆▅▃▂▁
    0 ┼──────────────────────────────────────────────────────────
      │ shared · · ▪ ▪ ■ ■ █ █ ■ ▪ ▪ · ·        ← people credited at both, per year
      │ moves    ↓   ↓↓  ↓     ↑  ↓                ← A→B (↓) and B→A (↑) first crossings
    0 ┼──────────────────────────────────────────────────────────
    6 ┤              ▁▂▄▆▇█████▇▆▅▄▃▂▁
   12 ┤                  ▂▄▆▇▆▄▂                                  Brand B ▼
      1998  2000  2002  2004  2006  2008  2010  2012  2014  2016
```

| Part | Spec |
|---|---|
| A bars | Grow upward from the upper baseline; fill `cmp-a`; width `min(16, yearWidth − 2)`; 3px rounded top, square at the baseline. |
| B bars | Grow downward from the lower baseline; fill `cmp-b`; same width; rounded bottom. |
| Scale | One linear scale used by both halves; tick labels printed once on the left for each half. Measure toggle: `VNs` (default) or `Releases`. Ports and re-releases are excluded from `VNs` and shown as a lighter cap (`ink` 10%) when `Releases` is on. |
| Crossover band | 28px between the baselines. Row 1: one cell per year, 12px high, fill `ink` at 0 / 10 / 25 / 45 / 70% for 0 / 1–2 / 3–5 / 6–10 / 11+ shared people active that year (a five-step single-hue ramp; legend printed under the chart). Row 2: move arrows, 8px, `ink-2`: `↓` for a person whose first credit at B follows a credit at A in that year, `↑` for the reverse; more than three in a year become a count. |
| Overlap bracket | A 1px ink bracket above the chart spanning the years both brands were active, labelled `Concurrent 2004–2011 (8y)`; or, if disjoint, an arrowed gap marker `A ends 2009 → B starts 2010 (1y gap)`. This is the same fact the verdict card names as its timeline evidence. |
| Direct labels | `Brand A ▲` and `Brand B ▼` at the right ends, in ink with the A / B tag. Peak year values are labelled; other values live in the tooltip and table. |
| Tooltip | Crosshair on year: A count, B count, shared people that year (names of up to five), moves. |
| Below `md` | Unchanged form, horizontally scrollable, with the y labels pinned. |

A and B are always tagged the same way everywhere on the page: **A = filled inverse tag, B = outlined tag** (16px mono letters).

### 6.5 Small figures

| Figure | Spec |
|---|---|
| **Corpus strip stat tile** | Label: eyebrow in `ink-3`. Value: sans 600 `text-xl`, proportional figures, compact above 100,000 only in narrow layouts (full numbers otherwise). Tiles separated by vertical hairlines, not boxes. Inferred counts carry the hollow-diamond glyph before the label and a dashed underline under the value. |
| **Containment bar** | A 120×6 bar per brand: full bar = that brand's weighted staff, filled part = share also found at the other brand. Fill `ink-2`, track `surface-sunken`. Two bars stacked (A in B, B in A) show asymmetry: lopsided containment is the visual signature of a sub-brand. Value printed right, mono `78%`. |
| **Career share bar** | Thin 4px segmented bar in studio-affinity rows: this brand's share of the person's credits, `ink-2` on `surface-sunken`, value right in mono. One colour: the rows are nominal, so the bar must not be recoloured by rank. |
| **Tenure sparkline** | 64×12 strip per roster row: one 2px tick per credited year, in the person's primary role hue at this brand, on a `surface-sunken` track spanning the brand's active years. Shows when in the brand's life someone was present. |
| **Role breakdown** | Tall segmented bar, 20px, segments in role hues with 2px `surface` gaps, in fixed role order; share printed inside a segment only when it fits; legend with codes beneath. Used on compare and affinity panels. |

---

## 7. App shell and global patterns

### 7.1 Shell

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [系] VNDB Explorer   Discover ▾   Compare      [ Search…            Ctrl K ]   Lens ▾  ◐ あ │  48px, surface, 1px rule-strong below
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                   page content, max 1440                                  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Data: VNDB database dump of 2026-11-23 · ODbL / DbCL · Inferences are this tool's own.   │  footer, text-xs ink-3
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- `Discover ▾`: Hidden Brand Links · Potential Aliases. `Compare` goes to `/compare`.
- The header search is hidden on `/` (the home page has the large one) and appears once the masthead scrolls away.
- `◐` theme switch (Light / Dark / System). `あ` name-order switch (Romanised first / 原文 first).
- The current section gets a 2px `seal` tick under its nav label: the only place the seal colour appears outside the mark.
- Footer always states the dump date and that inferences are not VNDB data.
- Below `md`: nav collapses to a menu button; search becomes an icon that opens a full-screen search sheet.

### 7.2 Unified search (`GlobalSearch`)

Input: height 44 on home (36 in the header), 1px `rule-strong`, radius 3, 16px search icon, placeholder "Search brands, staff, seiyuu, aliases, visual novels", `Ctrl K` hint in a mono kbd chip.

Results panel (`surface-raised`, `shadow-pop`, max height 70vh), grouped, up to 5 rows per group with a `See all` row:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BRANDS                                                                    │
│ ○ Key  鍵                                    CO · ja · 1999–2024     p24  │
│ ○ Key Sounds Label                           CO · ja                p1234 │
│ STAFF                                                                     │
│ ■ Maeda Jun  麻枝 准                          SCN MUS · 11 brands     s28  │
│ SEIYUU                                                                    │
│ ● Name Latin  原名                            CV · 214 VNs  ≟ 1      s999 │
│ ALIASES                                                                   │
│ = 別名  Alias Latin   → alias of Primary Name 原名                    s28  │
│ VISUAL NOVELS                                                             │
│ ▭ Title  原題                                 2004 · Brand           v123 │
├──────────────────────────────────────────────────────────────────────────┤
│ ↑↓ move   Enter open   Tab next group   Alt+Enter add to Compare          │
└──────────────────────────────────────────────────────────────────────────┘
```

- Row height 36. Leading mark doubles as type key: producer-type shape for brands, square for core staff, circle for seiyuu, `=` for an alias hit, rectangle for VNs.
- A person who is both appears once, under the group matching their majority of credits, with a `Dual` badge.
- Alias hits always show the matched alias first and the primary identity after the arrow. Potential aliases are never listed as aliases; a person with candidates shows a `≟ n` flag only.
- Matched text is marked with a `surface-sunken` background and weight 600, not colour.
- Prefix scopes: `p:` brands, `s:` staff and seiyuu, `v:` VNs, `a:` aliases. A bare VNDB ID (`p24`, `s28`, `v17`) jumps straight to the record.
- `Alt+Enter` on a brand fills the next empty Compare slot and shows a toast-free inline confirmation in the panel footer (`A = Key. Pick B.`).
- States: before typing, the panel shows recent searches and three example queries. No results: "No match for 'xyz'. VNDB IDs like p24 or s28 work too." Loading: rows hold, a 2px indeterminate bar runs under the input.

### 7.3 The lens (population and weighting controls)

Overlap maths depends on who is counted. Those choices are one global, URL-backed control called the **lens**, shown as a summary chip in the header (`Lens: Core · cap 15`) and as a full control row at the top of any page that computes overlap.

| Control | Options | URL param |
|---|---|---|
| Population | `Core staff` (default) · `+ Seiyuu` | `seiyuu=1` |
| Role preset | `Creative core` (DIR, SCN, CHD, ART) · `Core + music` (default) · `All dev credits` · `Localization` (TL, ED, QA) | `roles=` |
| Mobility cap | `Off` · `≤ 15 brands` (default) · `≤ 8 brands` | `cap=` |

Rules: the lens state is always visible in words next to any number it affects; changing it re-renders every dependent number on the page together; people removed by the cap stay listed but hatched (5.9). The Seiyuu switch uses the circle glyph and seiyuu hue so it reads as "add the circles".

### 7.4 URL state

Everything that changes what is shown is in the URL so a finding can be shared: tabs (`?tab=inferred`), filters, lens, sort, selected graph node (`?sel=p123`), open drawer (`?open=p24-p1234`), timeline zoom (`?from=2004&to=2012`), compare pair (`?a=p24&b=p1234`). Density, theme and name order are personal and stay in `localStorage`.

### 7.5 Loading, empty, error, sparse

| State | Pattern |
|---|---|
| First load | Server-rendered identity header first; below it, skeletons shaped like the real blocks: hairline-outlined cards with `surface-sunken` bars at 60% and 35% widths. No spinners, no shimmer gradient; a 1.2s opacity pulse only. |
| Refetch | Previous content at 60% opacity + a 2px indeterminate bar under the section header. Layout never jumps. |
| Empty, expected | One line in `ink-3`, no illustration, no card chrome: "No explicit relations in VNDB." |
| Empty, inferred | Says why and what would change it: "No inferred relations at confidence ≥ 50 with the current lens. Lower the threshold or include seiyuu." with those two actions as ghost buttons. |
| Too sparse to infer | A neutral, hatched (`hatch-muted`) notice: "Too few credits to infer relationships (3 credited staff)." This is distinct from "we looked and found nothing". |
| Error | Inline in the failing section only: `danger` 3px left rail, plain message, `Retry` button. The rest of the page stays usable. |
| Not found | Page-level: the ID in mono, "is not in the 2026-11-23 dump", and the search box. |

---

## 8. Route blueprints

Wireframes show the `lg` (≥ 1152px) layout. Each route lists its responsive collapse, states and components.

### 8.1 `/` — Command and discovery home

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│   Who made this, and where did they go next?                       (display, 44px)       │
│   Trace staff and seiyuu across visual novel studios, and surface                        │
│   the brand relationships VNDB does not record.                    (16px, ink-2)         │
│                                                                                          │
│   ┌────────────────────────────────────────────────────────────────────────┐             │
│   │ ⌕  Search brands, staff, seiyuu, aliases, visual novels        Ctrl K  │   44px      │
│   └────────────────────────────────────────────────────────────────────────┘             │
│   Try:  Key   ·  s:maeda  ·  p24 vs p1234                                                │
│                                                                                          │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ PRODUCERS   EXPLICIT LINKS  ◇INFERRED LINKS   STAFF     ALIAS NAMES  ◇POTENTIAL   VNs     │
│ 31,033      3,854           ⌜n⌝               55,878    68,491       ⌜n⌝          68,308  │
│                                                                    dump of 2026-11-23     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌────────────────────────────┐ │
│ │ ◇ HIDDEN BRAND LINKS     │ │ ≟ POTENTIAL ALIASES      │ │ BRAND COMPARE              │ │
│ │ Relationships the staff  │ │ Separate staff records   │ │ [A  pick a brand…       ]  │ │
│ │ lists imply but VNDB     │ │ that may be one person.  │ │ [B  pick a brand…       ]  │ │
│ │ does not record.         │ │                          │ │                            │ │
│ │ ┄┄ SB? 412 · SIS? 388 …  │ │ High 96 · Med 310 · …    │ │            [ Compare → ]   │ │
│ │              Explore →   │ │               Review →   │ │                            │ │
│ └──────────────────────────┘ └──────────────────────────┘ └────────────────────────────┘ │
├───────────────────────────────────────────────┬──────────────────────────────────────────┤
│ High-signal implicit links             See all│ Top career movers                 See all│
│ ─────────────────────────────────────────────│ ──────────────────────────────────────── │
│ Brand A ┄┄ SB? ┄┄▶ Brand B   91 ▮▮▮▮▮  14 sh. │ ■ Name 原名    SCN   17 brands  1998–2023 │
│ Brand C ┄┄ SIS? ┄┄ Brand D   88 ▮▮▮▮▮   9 sh. │ ● Name 原名    CV    64 brands  2003–2025 │
│ … 8 rows                                      │ … 8 rows                                  │
└───────────────────────────────────────────────┴──────────────────────────────────────────┘
```

- **Masthead:** left-aligned, not centred; the question is the hero. No illustration.
- **Corpus strip:** seven stat tiles divided by hairlines. The two inferred counts use the dashed-underline treatment; all others are plain. Numbers shown as `n` come from the classifier at build time.
- **Quick-jump cards:** equal width, `surface`, 1px `rule-strong`; the two inferred cards carry `rail-inferred` and the hollow-diamond eyebrow. The first two show a one-line class or tier breakdown using small dashed swatches. The Compare card embeds two `ProducerPicker`s and submits to `/compare?a=&b=`.
- **Implicit links preview:** rows of `Brand A · dashed class edge glyph · Brand B · ConfidenceMeter · shared count`. Curated = highest confidence among pairs with **no** explicit path, one per brand, so the list is not eight imprints of one publisher. Row click opens `/discover/brands?open=pA-pB`.
- **Top career movers:** ranked by distinct brands within the role preset, capped to people with a meaningful span. Mark shape separates staff and seiyuu; a segmented control `All | Core | Seiyuu` filters. Row click → `/staff/[id]`.

Responsive: cards stack at `md`; the two preview lists stack; the corpus strip becomes a 2-column grid of tiles at `sm`.
States: preview lists use row skeletons; if the inference tables are not built yet, the inferred tiles show `—` and the cards say "Inference index not built" with `hatch-muted`.

### 8.2 `/producer/[id]` — Studio / brand intelligence

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ COMPANY · CO · ja                                                     [ Compare with… ▾ ] │
│ Key                                                              (display 32)             │
│ 鍵                                                               (display 16, ink-2)      │
│ 132 VNs · 418 staff · 291 seiyuu · 1999–2024                                              │
│ ↗ Official site   ↗ VNDB p24   ↗ Wikidata   ↗ EGS                aka: alias, alias        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Overview   Relationships 14   Graph   Migration   Roster 709   Games 132    (sticky, 40px)│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Lens:  Population [Core staff | + Seiyuu]   Roles [Core + music ▾]   Mobility cap [≤ 15 ▾]│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Relationships                                                                             │
│ [ ◇ Inferred 9 ] [ ■ VNDB explicit 5 ]                              Min confidence [50 ▾] │
│ ┆ ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│ ┆ │ Brand B  ブランドB   CO · ja · 2006–2019          ◇ Sub-brand / Imprint?  91 ▮▮▮▮▮ │   │
│ ┆ │ Likely sub-brand of Key.                                            (italic)     │   │
│ ┆ │ [Shared staff 14 (wt 9.2) ●●●] [Containment 78% of B ●●●] [Concurrent 2006–19 ●●]│   │
│ ┆ │ [Shared series ×2 ●] [Same website domain ●●]                                    │   │
│ ┆ │ ▸ 14 shared people   ■ Name  ■ Name  ■ Name  ● Name  +10        Compare →  Open →│   │
│ ┆ └──────────────────────────────────────────────────────────────────────────────────┘   │
│ ┆ … more cards, sorted by confidence                                                      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Relationship neighbourhood                                            [Graph | Table]     │
│ filter row (6.2)                                                                          │
│ ┌───────────────────────────────────────────────────────────────┬──────────────────────┐ │
│ │                                                               │ INSPECTOR            │ │
│ │                    RelationGraph (16:10)                      │ selected node/edge   │ │
│ │  legend                                                       │ evidence + actions   │ │
│ └───────────────────────────────────────────────────────────────┴──────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Staff migration                         Inflow ← Key → Outflow          [Flow | Table]    │
│ MigrationFlow (6.3)                                                                       │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Roster                                                                                    │
│ [ ■ Core staff 418 ] [ ● Seiyuu 291 ]     Role [All ▾]  Tenure [Any ▾]   ⌕ filter   ≡ dens │
│ table (below)                                                                             │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Games                                                                                     │
│ [ Developed 96 ] [ Published / ported 36 ]            Year ▾   All-ages / 18+ ▾           │
│ table (below)                                                                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Identity header.** Eyebrow line: full type word, type code, language. `NamePair stacked`. `StatInline` row. External links as a wrapping row of text links with the north-east arrow, most useful first (official site, VNDB, Wikidata, then others behind `+6 more`). `aka` shows `producers.alias` values in `ink-2`. `Compare with… ▾` opens a `ProducerPicker` popover whose top suggestions are this brand's strongest inferred and explicit neighbours; choosing one goes to `/compare?a=<this>&b=<pick>`.

**Section nav.** Sticky under the top bar; scroll-spy underlines the current section; counts in mono.

**Relationships.**

- Register tabs, not a mixed list. Inferred is first because it is the product's reason to exist, but the tab bar always shows both counts, and the explicit tab is one click away. The inferred tab body carries `rail-inferred` down its left edge; the explicit tab body carries `rail-confirmed`.
- **Inferred relation card** (`InferredRelationCard`): row 1 = target `NamePair inline` + type, language, `YearSpan` · right: `RelationBadge` (dashed) + `ConfidenceMeter`. Row 2 = verdict sentence in italic display 16px. Row 3 = `EvidenceTag`s, strongest first, fixed order `shared_staff, containment, timeline, shared_series, shared_link, co_release, explicit_2hop`. Row 4 = disclosure `▸ n shared people` with a preview of up to five `PersonPill`s (squares and circles), and actions `Compare →`, `Open →`. Expanding row 4 shows a compact table: person, roles here, roles there, alias here, alias there, years here, years there, mobility.
- If VNDB already records a relation between the pair, the card adds a line: `■ VNDB: Imprint` and the note "corroborates VNDB" or, when the classes disagree, "*differs from VNDB (Spinoff)*" in ink with the seal glyph. Disagreement is information, not an error state.
- **Explicit tab** is split into two titled groups, each a simple ruled list:
  - **Corporate ownership** — `sub`/`par`, `imp`/`ipa`, `old`/`new`. Sub-headed by direction: *Owned by / parent of this brand* (↑), *Owns / imprints of this brand* (↓), *Renamed* (← Formerly, → Succeeded by).
  - **Lineage / spinoffs** — `spa`/`ori`: *Originated from* (←), *Spawned* (→).
  - Row: direction arrow · `RelationBadge` (solid) · target `NamePair inline` · type · `YearSpan` · VN count · `↗ VNDB`. No meter, no evidence tags: VNDB states it, the tool does not second-guess it here.

**Graph.** Per 6.2. Inspector panel 320px on the right: empty state "Select a brand or a line to see why it is here."; with a node selected, a mini identity (name, type, span, counts) and the relation(s) to the focus; with an edge selected, the evidence breakdown.

**Migration.** Per 6.3.

**Roster table** (`RosterTable`), two tabs. Columns:

| Column | Core staff tab | Seiyuu tab |
|---|---|---|
| Person | `NamePair inline` + `PotentialAliasFlag` if any | same |
| Credited as | alias chip when not the primary name; empty otherwise; several aliases show `+1` | same |
| Roles | `RolePill`s in precedence order | `CV` + main / side counts (`12 main · 30 side`) |
| Tenure | `YearSpan` + tenure sparkline | same |
| VNs | count, `tnum`, right-aligned | count; plus distinct characters |
| Mobility | `MobilityIndicator` | same |
| Also at | up to two other brands as text links, `+n` | same |

Default sort: VNs descending. The `Credited as` column header has a filter `Only pen-name credits`. Rows are 32px; row click → `/staff/[id]`.

**Games table** (`GamesTable`), two tabs so original development is never mixed with ports and publishing:

- *Developed*: release year · title `NamePair inline` · platforms (mono codes) · rating tag (`18+` in a 1px ink box; all-ages unmarked) · staff credited · co-developers (links).
- *Published / ported*: same columns, plus `Role` (`Publisher`, `Port`, `Localization`) and `Original developer` (link). Rows here are set in `ink-2` so the developed list reads as primary.

Responsive: below `lg` the graph inspector moves under the canvas; below `md` the graph becomes its table, the migration flow becomes ranked lists, tables switch to comfortable density and hide `Also at` and the sparkline; the relation card stacks badge and meter under the name.

States: brand with no staff credits → Relationships shows the sparse notice; Migration and Roster show "No staff credits recorded for this brand's VNs." Publisher-only brands open on the *Published / ported* tab.

### 8.3 `/staff/[id]` — Staff and seiyuu career tracker

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [■ Core Dev] [● Seiyuu]  → DUAL                                                           │
│ Name Latin                                                       (display 32)             │
│ 原名                                                             (display 16, ink-2)      │
│ SCN  MUS  DIR   ·  1998–2023  ·  11 brands  ·  47 VNs                                     │
│ ↗ VNDB s28   ↗ Twitter   ↗ Wikidata        Own label: ○ Brand Name (p555) →               │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Overview   Aliases 4 · ≟2   Timeline   Affinity   Collaborators   Credits 63               │
├───────────────────────────────────────────────┬──────────────────────────────────────────┤
│ ■ CONFIRMED VNDB ALIASES                       │ ◇ POTENTIAL UNLINKED ALIASES — INFERRED   │
│ (rail-confirmed, surface)                      │ (rail-inferred, hatch on header band)     │
│                                                │ Separate VNDB records that may be this    │
│ = 山田太郎  Yamada Tarou      PRIMARY          │ person. Not confirmed.                    │
│     Brand A 1999–2004 · Brand B 2005–2008      │ ┌──────────────────────────────────────┐  │
│ = YAMADA                                       │ │▌≟ Other Name 別名  s12345  ● Seiyuu  │  │
│     Brand C 2009–2016           ⇄ switched     │ │▌ HIGH  88 ▮▮▮▮▮                      │  │
│ = やまだ                                        │ │▌ 2003–2019 · 9 brands · 6 shared     │  │
│     Brand D 2011–2014                          │ │▌ [Shared character ×3 ●●●]           │  │
│ = T.Y                                          │ │▌ [Shared external link ●●●]          │  │
│     unused in credits                          │ │▌ [Never co-credited, same studios ●●]│  │
│                                                │ │▌ Overlay on timeline · Compare · Open│  │
│                                                │ └──────────────────────────────────────┘  │
│                                                │ … next candidate                          │
├───────────────────────────────────────────────┴──────────────────────────────────────────┤
│ Career timeline            Roles ▾   Show all transitions ○   Overlay candidate ▾  [Table]│
│ CareerTimeline (6.1)                                                                      │
├───────────────────────────────────────────────┬──────────────────────────────────────────┤
│ Studio affinity                                │ Brand transitions                         │
│ Brand        VNs  Tenure     Roles    Share    │ Brand A → Brand B   2004→2005   1y  3 co  │
│ Brand C       18  2009–2016  SCN DIR  ▬▬▬ 38%  │ Brand B → Brand C   2008→2009   1y  5 co  │
│ Brand A       12  1999–2004  SCN      ▬▬ 26%   │ Brand C → Brand D   2014→2011   concurrent│
├───────────────────────────────────────────────┴──────────────────────────────────────────┤
│ Frequent collaborators and co-movers          [ Collaborators | Co-movers | Co-stars ]    │
│ ■ Name 原名   ART   12 shared VNs · 3 shared brands   moved together: A→B 2005, B→C 2009   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Full credits                Role ▾  Studio ▾  Rating [All | All-ages | 18+]  ⌕   ≡        │
│ Year  Title          Brand     Role(s)   Credited as   Character (CV)      Rating         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Identity header.** `DisciplineBadge` first: `Core Dev`, `Seiyuu` or `Dual`, derived from credit counts (Dual when both sides have at least 3 credits or 15% of the total). Role pills ordered by frequency. `StatInline`: span, brands, VNs. External links row. If `staff.prod` is set, `Own label:` with a producer chip linking to `/producer/[id]`; the header of that producer page reciprocates with `Personal label of <person>`. The page title uses the primary name only; candidates never appear in the header.

**Aliases panel.** Two zones, side by side at `lg`, with a 24px gap and visibly different ground:

1. **Confirmed VNDB aliases** (left, `rail-confirmed`). One row per `staff_alias` entry. Line 1: `=` glyph, `NamePair inline`, `PRIMARY` eyebrow tag on `staff.main`. Line 2 (indented, `text-xs ink-2`): where it was used — brand links with `YearSpan`s, most-used first, `+n more` after three. An alias never used in a credit says "unused in credits" in `ink-3`. When consecutive careers under different names line up with a change of brand, the later row gets a `⇄ switched` tag (the same swap mark as the timeline) with tooltip "Name changed when moving Brand B → Brand C (2008 → 2009)". Hovering a row highlights that alias's segment and marks on the timeline.
2. **Potential unlinked aliases — inferred** (right, `rail-inferred`). Zone header band is hatched and carries the eyebrow `◇ POTENTIAL UNLINKED ALIASES — INFERRED` plus one fixed sentence: "Separate VNDB records that may be this person. Not confirmed." Each candidate is a `PotentialAliasCard`: dashed border, 3px tier-coloured left block, `≟` glyph, the candidate's `NamePair inline`, mono ID, discipline badge; tier word + `ConfidenceMeter`; one meta line (`YearSpan`, brands, brands shared with this person); itemised `EvidenceTag`s; actions `Overlay on timeline`, `Compare careers` (opens the candidate comparison drawer: both identities side by side with shared brands, shared characters and links listed), `Open s12345 →`.

   Empty state: "No potential aliases found for this record." in `ink-3`, no hatch.

The two zones never merge on any breakpoint: below `lg` they stack, confirmed first, with the full inferred header band kept.

**Career timeline.** Per 6.1.

**Studio affinity and transitions.** Affinity table: brand `NamePair inline`, VNs (`tnum`), tenure `YearSpan`, role pills, alias used there (chip, only if not primary), career share bar + percent. Sorted by VNs. Transitions list: each `A → B` pair with boundary years, gap in years (`concurrent` when the stints overlap), and `n co` = people who made the same move within ±1 year, which opens the co-movers tab filtered to that move.

**Collaborators.** Segmented: `Collaborators` (most shared VNs), `Co-movers` (shared brands ≥ 2 **and** at least one same-direction move within ±1 year; the headline list for studio genealogy), and for seiyuu or dual people `Co-stars` (shared casts). Row: `PersonPill`, primary role, shared VNs, shared brands, and for co-movers a compact move trail (`A→B 2005 · B→C 2009`) in mono. A `PotentialAliasFlag` shows on any collaborator who has candidates. A candidate of *this* person never appears in this list silently: if a potential alias would rank here, the row is tagged `≟ candidate` so the reader does not mistake one person for a close colleague.

**Full credits table** (`CreditsTable`). Columns: year (`tnum`) · title `NamePair inline` · brand(s) · role pills · credited as (alias chip if not primary) · character with main/side marker (seiyuu rows only) · rating tag · note (VNDB credit note, truncated). Filters in one row above: role (multi), studio (multi, searchable), rating (`All | All-ages | 18+`), text filter. Default sort year descending; grouped by year with a sticky year gutter. Seiyuu rows and core rows share the table but carry their shape mark in the role column, and a `Core | Seiyuu | All` control appears for dual people.

Responsive: aliases zones stack; timeline becomes the stint list below `md`; affinity and transitions stack; credits table drops `note` and `rating` into an expandable row.

### 8.4 `/compare` — Brand X vs Brand Y

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Compare brands                                                                            │
│ [A] [ Key  鍵                     p24  ▾ ]   ⇄   [B] [ Brand B  ブランドB      p1234  ▾ ]  │
│ Lens:  Population [Core | + Seiyuu]   Roles [Core + music ▾]   Mobility cap [≤ 15 ▾]      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ VERDICT                                                                                   │
│ ┌────────────────────────────────────────┬───────────────────────────────────────────────┐│
│ │ ■ IN VNDB                              │ ◇ INFERRED                                    ││
│ │ No direct relation.                    │ Likely sub-brand of Key.          (italic)    ││
│ │ Path distance 2:                       │ ◇ Sub-brand / Imprint?     91 ▮▮▮▮▮  High     ││
│ │ Key ─IMP─ Parent Co. ─IMP─ Brand B     │ [Shared staff 14 (wt 9.2)] [Containment 78%]  ││
│ │ (a 2-hop sister by VNDB's own records) │ [Concurrent 2006–2019] [Shared series ×2]     ││
│ │                                        │ Runner-up: Sister brand? 64                   ││
│ └────────────────────────────────────────┴───────────────────────────────────────────────┘│
│  A in B  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░ 78% of B's staff also at A                                   │
│  B in A  ▬▬▬░░░░░░░░░░░░░░░░░░ 11% of A's staff also at B                                   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Activity timeline                                   Measure [VNs | Releases]     [Table]  │
│ CompareTimeline (6.4)                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Shared staff and seiyuu  14 core · 22 CV          [■ Core 14] [● Seiyuu 22]  ⌕   ≡        │
│ Person            │ A  as            roles    years     │ B  as            roles   years  │
│ ■ Name 原名  ≟    │ 山田太郎         SCN      1999–2004 │ YAMADA  ≠        SCN DIR 2009–16│
│ ■ Name 原名       │ —                ART      2001–2010 │ —                ART     2006–12│
│ ░ Name 原名 capped│ …                                   │ …                               │
├───────────────────────────────────────────────┬──────────────────────────────────────────┤
│ Role breakdown of shared staff                 │ Shared series and links                   │
│ A ▇▇▇▇▇▇▇▇▇▇▇▇▇▇  (segmented, role hues)        │ Series: Title ×3 VNs (A 2, B 1)           │
│ B ▇▇▇▇▇▇▇▇▇▇▇▇▇▇                                │ Links: same website domain example.jp     │
└───────────────────────────────────────────────┴──────────────────────────────────────────┘
```

**Pickers.** Two `ProducerPicker`s tagged `A` (filled) and `B` (outlined), a swap button between them. Each picker is a scoped search (brands only) showing `NamePair`, type, span and ID. URL: `?a=p24&b=p1234` plus lens params. With one slot empty the page shows the chosen brand's top neighbours as one-click suggestions for the other slot.

**Diagnostic verdict card** (`VerdictCard`). One card, two halves, a vertical hairline between them; the halves never merge into one sentence.

- *In VNDB* (left, `rail-confirmed`): the direct relation if one exists (`RelationBadge` solid + plain sentence), otherwise "No direct relation." and the **explicit path distance** with the shortest path drawn as a small inline chain of name chips joined by solid coded edges (`─IMP─`). Distance 2 through a shared parent is called out as "a 2-hop sister by VNDB's own records". No path within 4 hops: "Not connected in VNDB (searched to 4 hops)."
- *Inferred* (right, `rail-inferred`, hatched header band): italic verdict sentence, class badge, meter with tier word, the top four evidence tags, and the runner-up class with its score so the reader sees how close the call was. Below 25: "No relationship inferred with the current lens." in plain ink.
- Under the card: the two **containment bars** (6.5). Their asymmetry is the quickest read of the pair.
- Agreement line, when both halves exist: `Inference corroborates VNDB` or `Inference differs from VNDB`, set in ink below the card.

**Activity timeline.** Per 6.4.

**Shared staff and seiyuu matrix** (`SharedPeopleMatrix`). The key table of the page: one row per person credited at both, with two mirrored column groups under sticky `A` and `B` headers separated by a `rule-strong` vertical line.

- Per side: **credited as** (alias chip, or `—` when the primary name was used), roles, `YearSpan`, VN count.
- When the name used at A differs from the name used at B, the B-side chip gets a `≠` marker and the row gets a `surface-sunken` background: pen-name switches between the two brands are the rows to look at, so they are the only tinted rows. A header filter `Only different names (n)` isolates them.
- Tabs or a stacked split for Core (squares) and Seiyuu (circles); the seiyuu section exists only when the lens includes seiyuu, otherwise a ghost row says "22 shared seiyuu hidden by the lens. Include seiyuu."
- People removed by the mobility cap are listed last, hatched, tagged `capped`, with their brand count; a footer line states "5 itinerant people excluded from the score (cap ≤ 15 brands)".
- Sort: weight (default), first shared year, name. Row click → `/staff/[id]`.

**Role breakdown.** Two tall segmented bars (A and B) of shared-staff credits by role, fixed role order, with a shared legend of codes. Shows whether the overlap is writers and artists (structural) or vocalists and QA (incidental).

**Shared series and links.** Two ruled lists: VN series or relation groups that span both brands (title, count per side), and external-link coincidences (same domain, same account), each with the raw value shown in mono.

Responsive: verdict halves stack (VNDB first); the matrix collapses each person into a two-line row (`A:` line and `B:` line); pickers stack with the swap button between.
States: no pair → pickers plus suggestions; same brand in both slots → inline note "Pick two different brands."; no shared people → verdict still renders, matrix replaced by "No one is credited at both brands with the current lens." and lens actions.

### 8.5 `/discover/brands` — Implicit brand links explorer

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ◇ Hidden brand links                                    n pairs · inferred, not in VNDB   │
│ Relationships implied by shared staff, timelines and links.                               │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Class [All][SB?][SIS?][SUC?][PTN?]   VNDB status [Unlinked only | 2-hop sister | All]      │
│ Type [CO][NG][IN]   Language [ja ▾]   Roles [Core + music ▾]   Min confidence [──●──] 60  │
│ Seiyuu [○ include]   ⌕ brand name                                   Reset   ≡   [Export]  │
├───────────────────────────────────────────────────────────────────────┬──────────────────┤
│ Brand A            Class      Brand B            Conf     Shared Cont. │ DRAWER (420px)   │
│ ─────────────────────────────────────────────────────────────────────│ Brand A ┄SB?┄▶ B  │
│ ○ Name 原名  CO ja ┄SB?┄▶   ○ Name 原名  CO ja   91 ▮▮▮▮▮   14   78% │ ◇ Inferred 91    │
│   1999–2024                    2006–2019          Concurrent  unlinked│ verdict sentence │
│ ▢ Name      NG ja ┄SIS?┄    ▢ Name      NG ja    88 ▮▮▮▮▮    9   61% │ evidence list    │
│ …                                                                     │ shared people    │
│                                                                       │ mini timeline    │
│ 1–50 of n                                              ‹ 1 2 3 … ›    │ Compare → Open → │
└───────────────────────────────────────────────────────────────────────┴──────────────────┘
```

- **Header** carries the inferred eyebrow and the result count; the whole page is pencil territory, so the table card has `rail-inferred`.
- **Filter row** sits above everything it scopes. Class chips show the dashed swatch in the class hue and a count. `VNDB status` is a segmented control: `Unlinked only` (default — no explicit path at all), `2-hop sister` (connected only through a shared parent), `All` (includes pairs VNDB already links, shown with the seal glyph in the status column). Min confidence is a slider with a mono readout; default 60.
- **Table** (`BrandLinksTable`), compact density, 2-line rows (44px): line 1 names, line 2 `YearSpan`s and timeline tag.

| Column | Content |
|---|---|
| Brand A | type shape · `NamePair inline` · type code · language |
| Class | dashed edge glyph in the class hue with the code and direction (`┄SB?┄▶` points to the sub-brand; sister and partner have no arrow) |
| Brand B | same as A |
| Confidence | dense `ConfidenceMeter` with score; default sort |
| Shared | weighted shared staff, with raw count in `ink-3` (`9.2 · 14`) |
| Containment | the larger of the two directions, percent, with a 40px micro bar |
| Timeline | `Concurrent` / `Sequential 1y` / `Handoff 2009` |
| VNDB | `unlinked` (ink-3) · `2-hop` · `■ IMP` |

- Sortable columns: confidence, shared, containment, first year. Sticky header on `surface-sunken`. Keyboard: `↑↓` move rows, `Enter` opens the drawer, `C` opens Compare, `O` opens brand A, `Shift+O` brand B.
- **Detail drawer** (`RelationDrawer`, 420px, pushes the table at `xl`, overlays below): pair header with the dashed edge; verdict sentence; full evidence list as rows (tag, value, strength pips, `View` to open the underlying rows); two containment bars; shared people preview (pills, squares and circles); a compact `CompareTimeline` (120px tall); actions `Compare A vs B →`, `Open A →`, `Open B →`. URL `?open=pA-pB`.
- `Export` downloads the filtered rows as CSV, with a first-row comment stating the dump date and that the rows are inferred.

Responsive: below `lg` the drawer is a full-height sheet; below `md` each row becomes a card (A, class edge, B, meter, three key numbers).
States: empty → inferred-empty pattern with the two loosening actions; loading → 12 skeleton rows; the count in the header holds its previous value at 60% while refetching.

### 8.6 `/discover/aliases` — Potential alias detective

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ≟ Potential alias detective                         n candidate pairs · inferred          │
│ Pairs of separate VNDB staff records that may be the same person. None are confirmed.     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Who [All | ■ Staff | ● Seiyuu]   Tier [High][Medium][Speculative]                         │
│ Signal [Shared character][Shared link][Bio cross-ref][Name + studio][Complementary]       │
│ ⌕ name or ID                                                          Reset   ≡  [Export] │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ┆ INFERRED CANDIDATE                                              HIGH  88 ▮▮▮▮▮          │
│ ┆ ┌─────────────────────────────────┐        ┌─────────────────────────────────┐         │
│ ┆ │ ● Name A  原名A          s1111  │   ≟    │ ● Name B  原名B          s2222  │         │
│ ┆ │ CV · 2003–2019 · 31 brands      │ ┄┄┄┄┄┄ │ CV · 2004–2018 · 12 brands      │         │
│ ┆ │ 214 VNs                         │        │ 38 VNs                          │         │
│ ┆ └─────────────────────────────────┘        └─────────────────────────────────┘         │
│ ┆ Studio overlap 9 of 12 ▬▬▬▬▬▬▬▬▬░░░   Shared characters 3   Shared links 1   Co-credits 0│
│ ┆ [Shared character across releases ×3 ●●●] [Shared external link ●●●] [Never co-credited…]│
│ ┆                                                Compare careers ▸   Open A →   Open B →  │
│ ──────────────────────────────────────────────────────────────────────────────────────── │
│ ┆ INFERRED CANDIDATE                                              MEDIUM  61 ▮▮▮▮▯        │
│ ┆ …                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- The workspace is a list of **pair rows** (`AliasPairRow`), not a plain table: two identity panels side by side with the `≟` glyph and a dashed connector between them. This shape makes "two separate records" physically obvious.
- Every row starts with the eyebrow `INFERRED CANDIDATE` in persimmon and carries the dashed left rail; the tier word and meter sit top-right, with the 3px tier-coloured block running the row's height at the far left.
- Identity panel: shape mark, `NamePair inline`, mono ID, discipline, `YearSpan`, brands, VNs. Both panels use solid borders (each record is real); only the connector and the row frame are dashed.
- Metrics line: studio overlap as `n of m` (m = the smaller record's brand count) with a 120px bar; shared characters; shared links; co-credits (0 is expected and is itself a signal — the tooltip says why).
- Evidence tags below, strongest first. Each opens its rows: for `Shared character`, the VN, the character and the two releases with the differing cast credit.
- `Compare careers ▸` expands the row in place into the **candidate comparison**: a two-track `CareerTimeline` (A's marks solid, B's marks hollow-dashed, as in the overlay mode of 6.1) restricted to shared brands plus each side's top three others, and a table of shared characters and links.
- Filters: `Who` segmented with shape glyphs; tier chips with the tier-colour block and counts; signal chips (multi-select, match any); text search over names, aliases and IDs. Default: all, High + Medium.
- Sort: confidence (default), studio overlap, combined VNs.
- A pair is listed once (lower ID on the left). Records with several candidates show `+2 other candidates for s1111` linking to that person's aliases panel.
- There is no "confirm" or "merge" action anywhere. The only outbound action on a pair is `View on VNDB ↗` for each record, since the place to resolve an alias is VNDB itself.

Responsive: below `md` the two identity panels stack with the `≟` connector vertical between them; metrics wrap to two lines.
States: empty → inferred-empty pattern ("No candidates match. Include Speculative or clear signals."); loading → 6 skeleton pair rows.

### 8.7 `/vn/[id]` — Visual novel reference

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ VISUAL NOVEL · ja · 18+                                                                   │
│ Title Latin                                                      (display 32)             │
│ 原題                                                             (display 16, ink-2)      │
│ 2004  ·  3 releases  ·  ↗ VNDB v123   ↗ Official site                                     │
├───────────────────────────────────────────────┬──────────────────────────────────────────┤
│ Developed by                                   │ Release timeline                          │
│ ○ Brand A  ブランドA  CO          Open →       │ 2004 ●────── 2007 ○──── 2012 ○            │
│ Published / ported by                          │ 2004-04-28  Original · PC · 18+ · Brand A │
│ ○ Publisher X     Publisher (2004)             │ 2007-02-15  Port · PS2 · all-ages · Pub X │
│ ○ Porter Y        Port, PS2 (2007)             │ 2012-06-29  Re-release · PC · Brand A     │
├───────────────────────────────────────────────┴──────────────────────────────────────────┤
│ Credits                                    [ ■ Staff 18 ] [ ● Cast 24 ]   Edition [All ▾] │
│ Role   Person                 Credited as        Note                                     │
│ DIR    ■ Name 原名            —                                                            │
│ SCN    ■ Name 原名  ≟         as 別名             Route A                                  │
│ ART    ■ Name 原名            —                                                            │
│ ───────────────────────────────────────────────────────────────────────────────────────  │
│ Character            Voiced by               Credited as        Role                      │
│ Heroine 名前         ● Name 原名  ≟          as 別名             main                      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Related visual novels                                                                     │
│ Sequel →  Title 原題  2006  Brand A      Same series · Title 原題  2009  Brand C           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- A deliberately quiet reference page: everything on it is ink (VNDB data) except the `≟` flags, which are the only pencil marks.
- **Identity header:** language, rating tag, `NamePair stacked`, first release year, release count, links.
- **Developers vs ports/publishers:** two separately headed lists. *Developed by* rows are full-weight with a producer-type shape and `Open →`. *Published / ported by* rows are `ink-2` and state the role and year (`Port, PS2 (2007)`), derived from `releases_producers.developer` / `.publisher` and release type.
- **Release timeline:** a single-lane strip, the original release as a filled 10px ink dot, later releases as rings; under it a ruled list: date (mono), kind (`Original`, `Port`, `Re-release`, `Trial`, `Localization`), platforms, rating, producer. Kind is text, not colour.
- **Credits:** `Staff` and `Cast` tabs (squares and circles). Staff grouped by role in precedence order with the role code in the first column; `Credited as` shows the alias chip when the credit used a non-primary alias; `PotentialAliasFlag` follows the name where candidates exist. An `Edition` filter appears when `vn_staff.eid` distinguishes editions. Cast table: character `NamePair inline`, seiyuu, credited-as, main/side. When different releases credit **different seiyuu records for the same character**, the character row shows both with a `≟` between them and a link to the pair in `/discover/aliases`: this is the page where that evidence is most legible.
- **Related VNs:** grouped by VNDB relation (`Sequel`, `Prequel`, `Same series`, `Side story`, `Parent story`, `Alternative version`, `Shares characters`, `Same setting`, `Fandisc`, `Original game`), each a row with title, year and developer. Rows where the developer differs from this VN's developer get a small `≠ dev` tag, since a series changing hands is lineage evidence.

Responsive: the two top columns stack; credits tables drop the note column into the row expander.
States: VN with no staff or cast → "No staff credits recorded in VNDB for this title." (plain, not hatched: this is missing source data, not a failed inference).

---

## 9. Svelte 5 component inventory

Conventions: runes only (`$props`, `$state`, `$derived`, `$effect` sparingly); content projection with snippets; no component reads global stores for data, only for the lens and preferences; every chart takes plain serialisable view-model props so it can be server-rendered. Suggested layout: `src/lib/components/<group>/<Name>.svelte`.

### 9.1 Shell

| Component | Key props | Notes |
|---|---|---|
| `AppShell` | `children` | Top bar, footer, skip link |
| `TopBar` | — | Nav, header search, lens chip, theme and name-order switches |
| `GlobalSearch` | `size: 'hero' \| 'bar'` | Combobox pattern; debounced; grouped results |
| `SearchResultRow` | `item` | One per entity kind via `kind` discriminant |
| `LensControls` | `value`, `onchange`, `show: ('population' \| 'roles' \| 'cap')[]` | URL-synced |
| `LensChip` | — | Header summary of the lens |
| `SectionNav` | `sections: {id,label,count?}[]` | Sticky, scroll-spy |
| `SectionHeader` | `title`, `count?`, `actions?: Snippet` | Heading + rule |
| `ThemeSwitch`, `NameOrderSwitch`, `DensitySwitch` | — | `localStorage` |
| `DataFooter` | `dumpDate` | Attribution line |

### 9.2 Identity and text

| Component | Key props |
|---|---|
| `NamePair` | `name`, `latin?`, `lang`, `variant: 'stacked' \| 'inline' \| 'compact'`, `href?` |
| `AliasCredit` | `primary: Name`, `alias?: Name` — renders the `as [alias]` pattern |
| `EntityId` | `id` (mono, copy on click) |
| `YearSpan` | `from`, `to?`, `ongoing?`, `tight?` |
| `StatInline` | `items: {value,label}[]` |
| `ExternalLinks` | `links: {site,url,label}[]`, `max?` |
| `ProducerTypeBadge` | `type: 'co' \| 'ng' \| 'in'`, `full?` |
| `DisciplineBadge` | `kind: 'core' \| 'seiyuu' \| 'dual'` |
| `RatingTag` | `minage` |
| `ProducerIdentityHeader`, `StaffIdentityHeader`, `VnIdentityHeader` | page view models |

### 9.3 Epistemic

| Component | Key props |
|---|---|
| `EpistemicGlyph` | `kind: 'confirmed' \| 'inferred' \| 'alias-confirmed' \| 'alias-potential'`, `size` |
| `EpistemicBadge` | `register: 'confirmed' \| 'inferred'` |
| `EpistemicZone` | `register`, `title`, `note?`, `children` — the railed, headed container every confirmed/inferred block sits in |
| `RelationBadge` | `kind: 'ownership' \| 'sister' \| 'lineage' \| 'partner'`, `register`, `label`, `direction?`, `dense?` |
| `ConfidenceMeter` | `score` (0–100), `dense?`, `showTier?` |
| `TierBadge` | `tier: 'high' \| 'medium' \| 'speculative'` |
| `EvidenceTag` | `type`, `label`, `value?`, `strength: 1 \| 2 \| 3`, `onopen` |
| `EvidenceList` | `items`, `max?` |
| `EvidenceRowsPopover` | `evidence` — the underlying rows behind a tag |
| `ConfirmedAliasRow` | `alias`, `usage: {producer, span}[]`, `isPrimary`, `switched?` |
| `PotentialAliasCard` | `candidate`, `tier`, `score`, `evidence`, `onoverlay` |
| `PotentialAliasFlag` | `candidates: {id,tier}[]` |
| `AgreementNote` | `state: 'corroborates' \| 'differs' \| 'none'` |

### 9.4 People and roles

| Component | Key props |
|---|---|
| `RoleMark` | `role`, `size`, `variant: 'filled' \| 'hollow'` (square or circle chosen from the role) |
| `RolePill` | `role` |
| `RoleLegend` | `roles`, `interactive?`, `active?`, `ontoggle` |
| `PersonPill` | `person`, `role?`, `years?`, `href` |
| `PersonPillList` | `people`, `max`, `overflowHref?` |
| `MobilityIndicator` | `brandCount`, `capped?` |
| `TenureSparkline` | `years: number[]`, `domain: [from,to]`, `role` |

### 9.5 Relations

| Component | Key props |
|---|---|
| `RelationTabs` | `inferredCount`, `explicitCount`, `tab` (bindable) |
| `InferredRelationCard` | `relation: InferredRelation`, `focusId` |
| `SharedPeoplePreview` | `people`, `expanded` (bindable) |
| `ExplicitRelationGroup` | `title`, `rows: ExplicitRelation[]` |
| `ExplicitRelationRow` | `relation` |
| `VerdictCard` | `explicit: ExplicitVerdict`, `inferred: InferredVerdict \| null` |
| `ExplicitPathChain` | `path: {node, edge}[]` |
| `ContainmentBars` | `aInB`, `bInA`, `labels` |
| `ProducerPicker` | `value` (bindable), `slot: 'A' \| 'B'`, `suggestions?` |
| `RelationDrawer` | `pair`, `open` (bindable) |

### 9.6 Visualisations

| Component | Key props | Sub-components |
|---|---|---|
| `ChartCard` | `title`, `view` (bindable `'chart' \| 'table'`), `controls?: Snippet`, `legend?: Snippet` | wraps every chart; owns the table toggle and refetch dimming |
| `ChartTooltip` | `anchor`, `children` | shared, values-first |
| `CareerTimeline` | `lanes: TimelineLane[]`, `aliases: AliasSegment[]`, `transitions`, `overlay?: CandidateOverlay`, `range` (bindable) | `TimelineAxis`, `TimelineLaneRow`, `CreditMark`, `AliasStrip`, `TransitionConnector`, `TimelineLegend` |
| `CareerStintList` | same data | mobile twin |
| `RelationGraph` | `focus`, `nodes`, `edges`, `filters` (bindable), `selected` (bindable) | `GraphNode`, `GraphEdge`, `GraphLegend`, `GraphFilterRow`, `GraphInspector`, `EdgeEvidencePopover` |
| `MigrationFlow` | `focus`, `inflow: FlowRow[]`, `outflow: FlowRow[]`, `mode: 'primary' \| 'all'` | `FlowRibbon`, `FlowRowLabel`, `FlowPillar`, `FlowPeopleDrawer`, `MigrationRankList` (mobile) |
| `CompareTimeline` | `a: YearSeries`, `b: YearSeries`, `shared: YearCount[]`, `moves`, `measure` | `CrossoverBand`, `OverlapBracket` |
| `RoleBreakdownBar` | `segments: {role,count}[]`, `label?` | |
| `ShareBar` | `value` (0–1), `width?` | |
| `StatTile` | `label`, `value`, `inferred?` | |

Layout maths (compass sectors, collision relaxation, ribbon paths, lane stacking) lives in pure functions under `src/lib/viz/` so it can run on the server and be unit-tested without a DOM.

### 9.7 Tables and lists

| Component | Key props |
|---|---|
| `DataTable` | `columns`, `rows`, `sort` (bindable), `density`, `rowHref?`, `sticky?`, `row?: Snippet` — the shared base |
| `FilterBar` | `children`, `onreset`, `count?` |
| `FilterChip`, `SegmentedControl`, `RangeSlider`, `MultiSelect`, `TextFilter` | standard |
| `Pagination` | `page`, `pageSize`, `total` |
| `RosterTable` | `rows: RosterRow[]`, `mode: 'core' \| 'seiyuu'` |
| `GamesTable` | `rows: GameRow[]`, `mode: 'developed' \| 'published'` |
| `CreditsTable` | `rows: CreditRow[]`, `filters` (bindable) |
| `SharedPeopleMatrix` | `rows: SharedPersonRow[]`, `a`, `b`, `mode` |
| `StudioAffinityTable` | `rows` |
| `TransitionList` | `pairs` |
| `CollaboratorList` | `rows`, `mode: 'collab' \| 'comovers' \| 'costars'` |
| `BrandLinksTable` | `rows`, `selected` (bindable) |
| `AliasPairRow` | `pair`, `expanded` (bindable) |
| `AliasPairCompare` | `pair` — the in-place two-track comparison |
| `ReleaseTimelineStrip` | `releases` |
| `VnCreditsTable`, `VnCastTable`, `RelatedVnList` | VN page |
| `QuickJumpCard`, `ImplicitLinkPreviewRow`, `CareerMoverRow` | home |

### 9.8 Feedback

`Skeleton` (`shape: 'row' \| 'card' \| 'chart'`), `EmptyState` (`kind: 'expected' \| 'inferred' \| 'sparse'`, `actions?`), `InlineError` (`message`, `onretry`), `RefetchBar`.

### 9.9 View-model shapes the design assumes

```ts
type Register = 'confirmed' | 'inferred';
type RelationKind = 'ownership' | 'sister' | 'lineage' | 'partner';
type InferredClass = 'subbrand' | 'sister' | 'successor' | 'partner';
type ExplicitType = 'sub' | 'par' | 'imp' | 'ipa' | 'old' | 'new' | 'spa' | 'ori';
type Tier = 'high' | 'medium' | 'speculative';
type Role = 'director' | 'scenario' | 'chardesign' | 'art' | 'music' | 'songs' | 'seiyuu' | 'other';

interface Name { name: string; latin: string | null; lang: string }

interface InferredRelation {
  target: ProducerRef;
  cls: InferredClass;
  direction: 'focus-is-parent' | 'focus-is-child' | 'focus-is-predecessor' | 'focus-is-successor' | 'symmetric';
  confidence: number;                 // 0–100
  runnerUp?: { cls: InferredClass; confidence: number };
  seiyuuDriven: boolean;
  explicit?: { type: ExplicitType; agrees: boolean } | { distance: number };
  evidence: Evidence[];               // ordered, each with type, label, value, strength 1–3
  sharedPeople: SharedPerson[];
}

interface PotentialAlias {
  candidate: StaffRef;                // a separate staff.id, always
  score: number; tier: Tier;
  evidence: Evidence[];
  sharedBrands: number; coCredits: number;
}
```

---

## 10. Accessibility, motion, responsive rules

### 10.1 Accessibility

- **Contrast.** All text tokens meet WCAG AA on every surface they are used on (section 12). Data marks are ≥ 3:1 on `surface`.
- **Never colour alone.** Register = line style + glyph + label. Relation kind = hue + code + icon. Role = hue + shape + code. Tier = ramp step + word + meter segments.
- **Forced colours and print.** Under `forced-colors: active` and `@media print`: dashed/solid and hatches are kept (they are borders and patterns), hue tints are dropped, role tiles get their code printed beside them, and the timeline legend prints in full.
- **Keyboard.** Every chart is one tab stop with arrow-key navigation inside and a table twin. Drawers trap focus and close on `Esc`, returning focus to the opener. Sticky headers never cover the focused element (`scroll-margin-top: 104px`).
- **Screen readers.** Inferred items announce their register first: `aria-label="Inferred: likely sub-brand of Key, confidence 91 of 100"`. Potential alias links announce "Potential alias, not confirmed". Charts have a one-sentence `aria-description` summarising the finding and point to the table view.
- **Language.** `lang` on every original-script span. Page `lang="en"`.
- **Targets.** Minimum 24×24 hit area for marks, 32px for controls, 40px in comfortable density.
- **Untrusted text.** Names, notes and descriptions come from a public dump: render with text interpolation only, never `{@html}`. VNDB BBCode in descriptions is parsed to a whitelist (links, line breaks) before display.

### 10.2 Motion

Quiet and functional. 120ms for hover and focus, 180ms for drawers, tabs and expanders, `--ease-out-quiet`. Charts do not animate in on load; on filter change marks cross-fade in 150ms without moving, except graph nodes, which translate to new positions over 240ms. `prefers-reduced-motion: reduce` removes all transitions and the skeleton pulse.

### 10.3 Breakpoints

| Name | Width | Main changes |
|---|---|---|
| base | < 640 | Single column; comfortable density; search sheet; charts use mobile twins; drawers are full-screen sheets |
| `sm` | ≥ 640 | Two-column stat grids; filter bars wrap to two rows |
| `md` | ≥ 896 | Swimlane timeline, relation graph and migration ribbons appear; side-by-side verdict |
| `lg` | ≥ 1152 | Two-zone alias panel; graph inspector at the side; regular density |
| `xl` | ≥ 1440 | Discover drawer pushes instead of overlays; compact density default on discover tables; 56px section gaps |

No horizontal page scroll at any width. Wide tables and the timeline scroll inside their own card with the first column pinned and a 16px fade at the scrolling edge.

---

## 11. Voice and wording

Wording is the last line of defence for epistemic clarity. These are rules, not suggestions.

| Confirmed (VNDB) | Inferred |
|---|---|
| "Imprint of Key" | "Likely sub-brand of Key" |
| "Alias" / "Also credited as" | "Potential alias" / "Possibly the same person as" / "Candidate" |
| "Succeeded by" | "Possible successor" |
| "VNDB lists…" | "Staff overlap suggests…" |

- Never write "is", "confirmed", "verified", "same person", "alias of" or "merged" about an inferred item. Never write "alias" without "potential" for a candidate.
- Hedge by tier: High → "Likely"; Medium → "Possibly"; Speculative → "Weak signal:".
- Inferred verdict sentences are italic (Latin text only); confirmed sentences are upright.
- Name the evidence in plain counts: "14 shared staff, 78% of Brand B's credited staff", not "strong affinity".
- No anthropomorphic or promotional framing: no "we discovered", no "AI", no "insight". The tool reports; the reader concludes.
- Empty states say what was looked for and how to widen the search.
- Numbers: thousands separators (`31,033`), percentages without decimals, years as four digits, year ranges with an en dash, deltas with a sign and unit (`−2y`, `+1y`).
- Dates are shown as the release's local calendar date (`2004-04-28`); the dump date is shown as a date only.

---

## 12. Validation record

What was checked for the v2.1 palette, and how. Colour checks are run with `data/review-shots/palette_check.py`, which reads the tokens straight out of `src/app.css` (WCAG contrast ratio; categorical separation as OKLab distance ×100 between every pair, under normal vision and under protan, deutan and tritan simulation per Machado et al. 2009 at full severity). Run against the v2.0 values, the same maths reproduces the contrast table and the worst-pair figures of the v2.0 record. The categorical sets come from a constrained search in OKLCH (`palette_search.py`) that maximises the worst pair across all four vision modes within fixed hue, chroma and lightness bands; the script reproduces the shipped sets. `token_audit.py` checks that `src/` uses nothing but tokens. `data/` is not tracked by git, so these scripts are local.

**Text contrast (WCAG ratio; the bracket is the hovered row)**

| Token | Dark: canvas · panel · tonal fill | Light: canvas · panel · tonal fill |
|---|---|---|
| `ink` | 17.3 · 16.4 · 14.9 (13.5) | 16.6 · 18.0 · 15.7 (14.6) |
| `ink-2` | 9.8 · 9.3 · 8.4 (7.6) | 9.2 · 10.0 · 8.7 (8.1) |
| `ink-3` | 6.0 · 5.7 · 5.1 (4.6) | 5.2 · 5.6 · 4.9 (4.6) |
| `confirmed` | 8.2 · 7.8 · 7.1 (6.4) | 6.7 · 7.2 · 6.3 (5.9) |
| `inferred` | 10.1 · 9.6 · 8.7 (7.9) | 6.1 · 6.6 · 5.8 (5.3) |
| `danger` | 7.4 · 7.0 · 6.3 (5.7) | 6.1 · 6.6 · 5.8 (5.4) |

Every text token clears 4.5:1 on all four grounds in both themes.

**Categorical palettes**

| Palette | Theme | Lowest contrast (canvas · panel · tonal fill · hover) | Worst pair, normal | Worst pair, protan · deutan · tritan |
|---|---|---|---|---|
| Relation kinds (4), edges and badge borders | Dark | 4.8 · 4.6 · 4.2 · 3.8 | 17.0 | 15.3 · 15.5 · 16.2 |
| Relation kinds (4) | Light | 4.6 · 4.9 · 4.3 · 4.0 | 13.0 | 11.4 · 11.1 · 11.0 |
| Roles (7), marks only | Dark | 4.8 · 4.5 · 4.1 · 3.7 | 10.7 | 8.5 · 8.4 · 8.7 |
| Roles (7), marks only | Light | 3.9 · 4.2 · 3.7 · 3.4 | 9.4 | 5.9 · 4.8 · 7.2 |
| Role squares (5, the one shared form) | Dark | — | 11.0 | 9.4 · 11.5 · 10.4 |
| Role squares (5) | Light | — | 9.4 | 9.8 · 8.8 · 8.7 |

Against v2.0, at lower chroma: the relation kinds hold (dark 14.6 to 15.3 at worst, light 10.9 to 11.0); the seven roles gain on dark (5.3 to 8.4) and hold on light (4.5 to 4.8); the five squares give some back (dark 11.2 to 9.4, light 9.4 to 8.7) and stay above the target of 8.

**Ordinal ramp (potential-alias tiers):** dark `#EBCD95 → #B79A64 → #8A703F` and light `#5B4315 → #876114 → #9F7932` are single-hue (under 1° of spread), monotone in lightness, and the faint end still clears 3:1 on every ground (3.8:1 on the dark panel, 4.0:1 on the light one, 3.1:1 and 3.3:1 on hover).

**Epistemic pair:** slate blue and sand are 18.9 apart in normal vision on dark (17.2 protan, 19.7 deutan, 16.4 tritan) and 20.7 on light (19.9, 21.3, 15.0). That is less than v2.0's cobalt and amber (26.1 and 28.9), the price of the lower chroma, and still more than any categorical pair above. They are never the only channel: line style, glyph and label always carry the register too.

**Zone edges:** the dashed `inferred-edge` is 3.0:1 against the panel in both themes (3.2:1 and 2.8:1 against the canvas beside it). The solid `confirmed-edge` is 2.0:1 and 1.9:1 by design: a quiet panel edge, with the glyph and the title beside it.

**Known limits, and the design rules that cover them**

1. **The role palette's worst pairs under colour-vision deficiency are across forms, not within one.** Dark: character design (square) against seiyuu (circle), 8.4, and against other (always hollow), 8.5. Light: character design (filled) against other (hollow), 4.8, and director (square) against seiyuu (circle), 5.9. Among the five filled squares the worst pair is 9.4 on dark and 8.7 on light across all four vision modes (target 8). Roles are also never colour-only: every mark sits beside a mono code.
2. **`ink-4` (2.3:1), the rules (`rule` 1.2:1, `rule-strong` 1.5:1, `rule-hover` 2.5:1) and `confirmed-edge` (2.0:1) are below 3:1 by design.** `ink-4` never carries text. A control is never identified by its border alone: inputs carry an icon and placeholder, buttons a label and fill, and focus is a 2px ring at 8.4:1.
3. **Hue families repeat across the role and relation palettes** (violet, teal, a red). They are scoped by form (2.3) and the two palettes are never used inside the same component. This is a judgement call, not a measured guarantee.
4. **Sand (`inferred`) sits near the partner yellow-green and the music yellow.** On dark its lowest distance across the four vision modes is 9.6 to music and 7.0 to partner; on light 10.6 to music, and to partner 5.9 in normal vision but 0.8 under deutan simulation (v2.0: 1.2). It is therefore never used as an edge, class-badge or role hue: a partner link is told from its dashed zone by its icon, code and label, and candidate marks on the career timeline are hollow and dashed, which separates them by form. The dark music yellow was set lighter by hand after the search for this reason (4.8 to 9.6).
5. **Not measured:** rendered contrast of the tints and the hatch (both decorative reinforcement of a border and a glyph), and any real-device check under forced colours; the forced-colours rules in `app.css` restate line style with system colours. The v2.1 values were validated by calculation and by a clean build; they have not been reviewed as rendered screens.

---

## 13. Assumptions and open questions

1. **Relation direction.** The dump stores `producers_relations(id, pid, relation)` in both directions. This spec labels types by VNDB's wording (`par` Parent producer, `sub` Subsidiary, `ipa` Parent brand, `imp` Imprint, `old` Formerly, `new` Succeeded by, `ori` Originated from, `spa` Spawned). Before building the explicit lists and graph arrows, confirm which of `id` / `pid` is the subject by checking one known imprint pair against vndb.org.
2. **Confidence scale.** The spec assumes the classifier emits 0–100 and that tier cut-offs are 75 / 50 / 25 for both brands and aliases. If alias tiers are rule-based rather than score-based, keep the tier words and drive the meter from the tier (5 / 3 / 2 segments).
3. **`songs` and non-creative roles.** `songs` shares the music hue as a hollow mark and counts as low-weight core; `staff`, `translator`, `editor`, `qa` fold into `other`. The `Localization` role preset exists because translators matter for localisation companies. If the engine weights these differently, only the lens labels change.
4. **"Seiyuu-driven" edges** need a flag from the engine (the edge clears the threshold only when seiyuu overlap is counted). Without it, the dotted style collapses into the ordinary inferred dash and the Seiyuu toggle only re-weights.
5. **Mobility cap defaults** (≤ 15 brands default, ≤ 8 strict) are placeholders for the engine's real thresholds; the UI shows whatever the engine reports.
6. **Fonts** are a recommendation and add download weight for CJK; if self-hosting is ruled out, the stacks fall back to system CJK faces without layout change, since the scale and line heights do not depend on the web fonts.
7. **Icon set.** The spec assumes a 16px-grid, 1.5px-stroke outline set for generic icons, plus custom inline SVG for the epistemic glyphs, relation-kind icons and role marks.
8. **Images.** VN covers and character images are deliberately absent from every view: the dump's image tables need rating-aware handling, and the research task does not need them. Adding them later should not change this layout (the VN identity header has room for a 96px cover at the left).
9. **Framework wording.** Component conventions target Svelte 5 runes; nothing here depends on a specific SvelteKit major version.
