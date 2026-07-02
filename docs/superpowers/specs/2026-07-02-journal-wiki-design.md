# The Journal Wiki — Design

Date: 2026-07-02
Status: Approved, pending implementation

## Context

`thecatechumensjournal.com/notes/` currently mirrors the *entire*
`~/Documents/Notes/Theology/` vault tree via Kiln — daily readings,
personal apologetics/debate notes (some naming real people), book-study
chapters, Raw/ source dumps, everything. This was discovered to still be
live as of the last publish (2026-06-27/28).

The user wants a clean split:
- **Private** (stays local-only): analysis notes, book-study chapters used
  for the active-learning review pipeline (`Theology/Orthodox/Book_Readings/`),
  daily readings, apologetics/debate notes, Raw/ sources.
- **Public**: `Theology/Wiki/` only — the AI-maintained, source-synthesizing
  layer (concept/entity/source pages with summaries and cross-references),
  which is already written in a Wikipedia-style reference format.

The site is rebranding from "Theology Notes" to **"The Journal Wiki"** —
status-neutral (the user is no longer technically a catechumen but the
main site's "Catechumen's Journal" branding is intentionally staying until
a planned rebrand once their first year is complete; the wiki name should
not need to change again when that happens). It moves from `/notes/` to
`/wiki/`.

Additionally: past builds already published private content (including
named third parties) into the `blog` git repo's history. That history
needs to be purged as a final step, once the new pipeline is verified
working.

## Goals

- Publish only `Theology/Wiki/` content to `thecatechumensjournal.com/wiki/`
- Never leave a dead/broken link on the public site to a private note
- Never modify the real vault files (`Theology/Wiki/*.md`) as a side effect
  of building the public site — the vault stays the single source of truth
- Purge git history of the `blog` repo of previously-published private
  content, as an explicit, separately-confirmed final step

## Non-goals

- Filtering/curating anything outside `Theology/Wiki/` for publication
  (e.g. no "curated subset of topical notes" — that was considered and
  rejected in favor of a clean Wiki-only boundary)
- Preserving `blog` repo commit history through the purge (a fresh orphan
  commit is acceptable; no `git filter-repo` archaeology)
- Automating the history-purge force-push — it always requires a live,
  explicit go-ahead at execution time

## Architecture

```
Theology/Wiki/*.md
      │
      ▼
[stage_wiki.py] ──copies to──▶ ~/Documents/Wiki_Staging/*.md
      │                              │
      │                     resolves every [[wikilink]] in each
      │                     staged file against Theology/Wiki/:
      │                       - target is another Wiki page → leave as-is
      │                       - target is private/unresolvable → delink to
      │                         plain text (display text/annotation kept)
      ▼                              ▼
                          kiln generate → ~/Documents/Static_Wiki
                            --name "The Journal Wiki"
                                            │
                                   existing post-processing:
                                   Byzantine CSS, favicon,
                                   bible/glossary tooltips
                                   (dashboard + folder-sort SKIPPED —
                                   Wiki/index.md is the homepage as-is)
                                            │
                                            ▼
                          [kiln_rewrite.py --base /wiki ...]
                                            │
                                            ▼
                          blog/static/wiki/  → commit → push → GitHub Pages
                                            │
                                            ▼
                          https://thecatechumensjournal.com/wiki/
```

The existing `vault-build.fish` / `vault-publish.fish` → `/notes/` pipeline
is retired, not kept as a parallel path. `static/notes/` is deleted from
the repo as part of the eventual history purge.

## Components

**`stage_wiki.py`** (new — `~/Documents/Notes/.claude/scripts/`)
- Wipes and recreates `~/Documents/Wiki_Staging/`
- Copies `Theology/Wiki/*.md` into it verbatim
- For every staged file, scans the *entire* file (not just a `## Source`
  section — real Wiki pages link to private notes throughout, e.g. dense
  "Daily readings" / "Synthesized from N corpus notes" / "Psalm studies"
  lists) for `[[wikilink]]`, `[[wikilink|alias]]`, and `[[wikilink#heading]]`
  syntax
- For each link found, resolves the note-name part against the set of
  filenames in `Theology/Wiki/`:
  - **Resolves to a Wiki page** → left untouched, renders as a normal
    working link
  - **Does not resolve within Wiki/** (private note, or genuinely
    unresolvable/dangling like `[[Romans 8:18]]`) → the `[[ ]]` syntax is
    stripped, leaving plain text. If the link had a trailing annotation
    (e.g. `[[20260701_reading]] — 1 Cor 13:8 "love never fails"...`) that
    annotation text is preserved unchanged. If the link was bare (no
    alias, no trailing text), the display text becomes the target note's
    frontmatter `title:` (read-only lookup against the real vault); if no
    `title:` exists, falls back to the filename with underscores replaced
    by spaces
- Read-only against `Theology/Wiki/*.md` and any note it looks up for a
  title — never writes back to the real vault

**`wiki-build.fish`** (new, sibling to `vault-build.fish`)
- Runs `stage_wiki.py`, then
  `kiln generate --input ~/Documents/Wiki_Staging --output ~/Documents/Static_Wiki --name "The Journal Wiki"`
- Bails (`or return $status`) if `stage_wiki.py` or `kiln generate` fail —
  no partial builds proceed to publish
- Re-applies existing post-build steps: Byzantine CSS skin, favicon,
  bible-reference tooltip, glossary tooltip
- Does **not** run `generate_dashboard.py` (vault-wide progress stats
  don't belong on a curated public wiki — Kiln's default behavior of
  rendering `Wiki/index.md` as the homepage is used as-is) or
  `sort_folder_pages.py` (Wiki/ is flat, nothing to sort)

**`kiln_rewrite.py`** (modified, not duplicated)
- Currently hardcodes `SRC=Static_Site`, `DST=blog/static/notes`,
  `BASE=/notes`
- Parametrized with `--src` / `--dst` / `--base` args; the old `/notes/`
  call site is deleted (no dual code path kept for backward compat)

**`wiki-publish.fish`** (new, sibling to `vault-publish.fish`)
- Runs `wiki-build`, then `kiln_rewrite.py --src ~/Documents/Static_Wiki --dst ~/Documents/blog/static/wiki --base /wiki`
- Commits `blog/static/wiki/`; skips the commit if nothing changed (same
  pattern as `vault-publish.fish` today)
- Pushes to `origin main`

## Error handling

- Wikilink resolution must handle all three Obsidian link forms:
  `[[note]]`, `[[note|alias]]`, `[[note#heading]]`
- Unresolvable link targets (typos, pseudo-links like `[[Romans 8:18]]`,
  pre-existing dangling refs — `kiln doctor` currently reports ~262 of
  these vault-wide) are treated as private/unknown and delinked to plain
  text — never left as a link pointing at nothing
- Missing or malformed frontmatter `title:` on a link target falls back
  to a humanized filename; a warning is printed to stderr, the build
  continues
- Empty or missing `Theology/Wiki/` directory → `stage_wiki.py` fails
  loudly (better an obvious error than silently publishing an empty site)
- `kiln generate` failure → `wiki-build.fish` stops immediately
- No changes since last build → `wiki-publish.fish` skips the commit,
  exits 0

## Verification plan

Before any git-history purge:
1. Diff a handful of staged files against their `Theology/Wiki/`
   originals — confirm annotation text is preserved and only private
   link brackets are stripped
2. `kiln serve` the `/wiki/` build locally; spot-check that Source
   citations render as plain text, intra-wiki cross-references are still
   clickable, the homepage shows `Wiki/index.md` content, and styling/
   tooltips load correctly
3. Grep the generated HTML output for stray `[[` — catches any regex
   misses on edge-case link syntax
4. Only once that's clean does the history purge proceed

## Git history purge (final step, separately confirmed)

- Create a fresh orphan commit in the `blog` repo containing only the
  current, cleaned state: the Hugo site plus the new `static/wiki/`
  output, with `static/notes/` removed entirely
- Force-set `main` to that orphan commit, force-push to `origin`
- Destructive and irreversible from GitHub's side (old commits become
  unreachable and eventually garbage-collected). This step is never
  bundled into the same work session as the pipeline build-out — it
  requires the user to have seen the new `/wiki/` site working correctly
  first, and an explicit go-ahead immediately before it runs
