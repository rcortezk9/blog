# The Journal Wiki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-vault `/notes/` mirror at thecatechumensjournal.com with a curated, wiki-only `/wiki/` site ("The Journal Wiki") built from `Theology/Wiki/` alone, with private-note links converted to plain-text citations, then purge the private content already sitting in the `blog` repo's git history.

**Architecture:** A new `stage_wiki.py` script copies `Theology/Wiki/*.md` into a scratch staging directory, delinking any `[[wikilink]]` that doesn't resolve to another `Theology/Wiki/` page (leaving annotation text intact). A new `wiki-build.fish` / `wiki-publish.fish` pair (siblings to the existing `vault-build.fish` / `vault-publish.fish`) builds that staging directory with Kiln and deploys it to `/wiki/`. `kiln_rewrite.py` is generalized to take `--src`/`--dst`/`--base` instead of hardcoded `/notes/` values. The old `/notes/` publish path is retired. Git history is purged as a final, separately-gated step.

**Tech Stack:** Python 3 (stdlib only, matching existing `.claude/scripts/` conventions), Fish shell functions, Kiln (Go static site generator), Hugo + GitHub Pages (existing `blog` repo).

## Global Constraints

- No formal test suite for `.claude/scripts/` in this vault — verification is manual (dry-run + diff + grep), matching the existing convention documented in `flashcard_reviewer_design.md`. Do not introduce pytest.
- `~/Documents/Notes` and `~/.config/fish` are **not** git repositories (Syncthing-managed) — nothing under `.claude/scripts/` or `~/.config/fish/functions/` gets a git commit. Only `~/Documents/blog` is git-tracked.
- Never modify `Theology/Wiki/*.md` (or any vault file) as a side effect of building the public site — read-only access to the vault, always.
- The git history purge (Task 6) requires a live, explicit go-ahead from the user immediately before the force-push runs — never execute it automatically as part of a batch.

---

### Task 1: `stage_wiki.py` — stage and delink

**Files:**
- Create: `~/Documents/Notes/.claude/scripts/stage_wiki.py`

**Interfaces:**
- Produces: `~/Documents/Wiki_Staging/*.md` (wiped and regenerated each run) — consumed by Task 3's `wiki-build.fish`

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""stage_wiki.py — Stages Theology/Wiki/ for the public wiki build.

Copies every Theology/Wiki/*.md file into a staging directory, delinking
any [[wikilink]] that points at a private note (anything that isn't
itself a Theology/Wiki/ page) into plain text. Never modifies the real
vault.

Run before wiki-build's `kiln generate` step:
    python3 ~/Documents/Notes/.claude/scripts/stage_wiki.py
"""

import glob
import os
import re
import shutil
import sys
from functools import lru_cache

VAULT = os.path.expanduser("~/Documents/Notes")
WIKI_DIR = os.path.join(VAULT, "Theology", "Wiki")
STAGING_DIR = os.path.expanduser("~/Documents/Wiki_Staging")

EXCLUDE_DIR_PARTS = {".trash", ".stversions", "trash", ".obsidian", ".obsidian.bak", ".git"}

WIKILINK_RE = re.compile(r'\[\[([^\]#|]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]')
FRONTMATTER_TITLE_RE = re.compile(r'^title:\s*"?([^"\n]+)"?\s*$', re.MULTILINE)


def wiki_page_names():
    """Names (filename without .md) of every page in Theology/Wiki/."""
    return {
        os.path.splitext(os.path.basename(p))[0]
        for p in glob.glob(os.path.join(WIKI_DIR, "*.md"))
    }


@lru_cache(maxsize=None)
def find_note_path(name):
    """Search the whole vault for name.md, skipping trash/version dirs."""
    for path in glob.glob(os.path.join(VAULT, "**", name + ".md"), recursive=True):
        parts = set(os.path.normpath(path).split(os.sep))
        if parts & EXCLUDE_DIR_PARTS:
            continue
        return path
    return None


@lru_cache(maxsize=None)
def resolve_title(name):
    """Frontmatter title for name, falling back to a humanized filename."""
    path = find_note_path(name)
    if path:
        try:
            with open(path, "r", encoding="utf-8") as f:
                head = f.read(2000)
            match = FRONTMATTER_TITLE_RE.search(head)
            if match:
                return match.group(1).strip()
        except OSError as e:
            print(f"  warning: could not read {path}: {e}", file=sys.stderr)
    return name.replace("_", " ")


def delink(match, wiki_names):
    name = match.group(1).strip()
    alias = match.group(3)
    if name in wiki_names:
        return match.group(0)  # public target — leave the link as-is
    return alias.strip() if alias else resolve_title(name)


def process_file(src_path, dst_path, wiki_names):
    with open(src_path, "r", encoding="utf-8") as f:
        text = f.read()
    new_text = WIKILINK_RE.sub(lambda m: delink(m, wiki_names), text)
    with open(dst_path, "w", encoding="utf-8") as f:
        f.write(new_text)


def main():
    md_files = glob.glob(os.path.join(WIKI_DIR, "*.md"))
    if not md_files:
        print(f"error: no markdown files found in {WIKI_DIR}", file=sys.stderr)
        sys.exit(1)

    if os.path.isdir(STAGING_DIR):
        shutil.rmtree(STAGING_DIR)
    os.makedirs(STAGING_DIR)

    wiki_names = wiki_page_names()
    for src_path in md_files:
        dst_path = os.path.join(STAGING_DIR, os.path.basename(src_path))
        process_file(src_path, dst_path, wiki_names)

    print(f"Staged {len(md_files)} wiki pages → {STAGING_DIR}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it against the real vault**

Run: `python3 ~/Documents/Notes/.claude/scripts/stage_wiki.py`
Expected: `Staged N wiki pages → /home/recocortez/Documents/Wiki_Staging` (N = count of files in `Theology/Wiki/*.md`, currently 31)

- [ ] **Step 3: Verify a private, no-alias link was delinked with its title looked up**

Run: `sed -n '36p' ~/Documents/Wiki_Staging/concept_theosis.md`
Expected: `| 1 | Theosis — The True Purpose of Human Life | The True Purpose of Human Life |`

(Original line 36 is `| 1 | [[theosis_purpose_human_life]] | The True Purpose of Human Life |` — `theosis_purpose_human_life` is a private `Book_Readings/` note, not a `Theology/Wiki/` page, so it gets delinked to its frontmatter title.)

- [ ] **Step 4: Verify a private link with trailing annotation text keeps the annotation**

Run: `sed -n '84p' ~/Documents/Wiki_Staging/concept_theosis.md`
Expected: `- Orthodox Daily Reading — 2026-07-01 — 1 Cor 13:8 "love never fails" as the one gift that carries into the age to come after prophecy and tongues have passed away; Matt 10:1-8 the Twelve's freely-given healing as love's provisional, this-age enactment of the same permanence`

- [ ] **Step 5: Verify a public (intra-wiki) link is left untouched**

Run: `sed -n '71p' ~/Documents/Wiki_Staging/concept_theosis.md`
Expected: `- [[concept_palamism_and_divine_energies]] — essence-energies distinction is the metaphysical ground of theosis`

- [ ] **Step 6: Verify the aggregate link count**

Run: `grep -c '\[\[' ~/Documents/Notes/Theology/Wiki/concept_theosis.md ~/Documents/Wiki_Staging/concept_theosis.md`
Expected:
```
/home/recocortez/Documents/Notes/Theology/Wiki/concept_theosis.md:33
/home/recocortez/Documents/Wiki_Staging/concept_theosis.md:10
```
(33 total links in the source; 10 point at other Wiki pages and survive, 23 private links got delinked.)

- [ ] **Step 7: Verify the real vault file was never touched**

Run: `grep -c '\[\[' ~/Documents/Notes/Theology/Wiki/concept_theosis.md`
Expected: `33` (unchanged from Step 6 — confirms the script only wrote to the staging copy)

---

### Task 2: Generalize `kiln_rewrite.py`

**Files:**
- Modify: `~/Documents/Notes/.claude/scripts/kiln_rewrite.py` (full rewrite of the file — every line changes to remove the hardcoded `/notes/` defaults)

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: a CLI taking `--src`, `--dst`, `--base` — consumed by Task 4's `wiki-publish.fish`

- [ ] **Step 1: Rewrite the file**

```python
#!/usr/bin/env python3
"""
kiln_rewrite.py — Rewrites Kiln static output to work under a base path.

Kiln generates absolute links (/style.css, /christology/...) that only work
when served at the domain root. This script copies the output and rewrites
every root-relative path so the site works under a given base path on the
Hugo blog (e.g. /wiki/).

Usage:
    python3 ~/Documents/Notes/.claude/scripts/kiln_rewrite.py \\
        --src ~/Documents/Static_Wiki \\
        --dst ~/Documents/blog/static/wiki \\
        --base /wiki
"""

import argparse
import os
import re
import shutil
import sys

BASE = None  # set from --base in main()


def rewrite_html(text):
    return re.sub(
        r'((?:href|src|action)=")(/(?!/))',
        lambda m: f'{m.group(1)}{BASE}{m.group(2)}',
        text
    )


def rewrite_js(text, filename):
    text = re.sub(
        r'((?:var|const|let)\s+BASE_URL\s*=\s*)""\s*(?:\.replace\([^)]+\))?',
        lambda m: f'{m.group(1)}"{BASE}"',
        text
    )

    if filename == "app.js":
        text = text.replace('"/giscus-theme-dark.css"', f'"{BASE}/giscus-theme-dark.css"')
        text = text.replace('"/giscus-theme-light.css"', f'"{BASE}/giscus-theme-light.css"')

    if filename == "search.js":
        text = text.replace(
            "item.href = entry.url;",
            "item.href = BASE_URL + entry.url;"
        )

    if filename == "canvas.js":
        text = text.replace(
            'const url = "/" + parts.join("/")',
            f'const url = "{BASE}/" + parts.join("/")'
        )
        text = re.sub(
            r'fetch\(`/\$\{slugPath\}`\)',
            f'fetch(`{BASE}/${{slugPath}}`)',
            text
        )

    return text


JS_FILES = {"search.js", "graph.js", "link-preview.js", "app.js", "canvas.js", "glossary_tooltip.js", "bible_tooltip.js"}


def main():
    global BASE

    parser = argparse.ArgumentParser(description="Rewrite Kiln output for a base path.")
    parser.add_argument("--src", required=True, help="Kiln output directory to read")
    parser.add_argument("--dst", required=True, help="Destination directory to write the rewritten site")
    parser.add_argument("--base", required=True, help="Base path, e.g. /wiki")
    args = parser.parse_args()

    src = os.path.expanduser(args.src)
    dst = os.path.expanduser(args.dst)
    BASE = args.base.rstrip("/")

    if not os.path.isdir(src):
        print(f"Error: Kiln output not found at {src}", file=sys.stderr)
        sys.exit(1)

    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)

    html_count = js_count = 0

    for root, _, files in os.walk(dst):
        for fname in files:
            fpath = os.path.join(root, fname)
            ext = os.path.splitext(fname)[1].lower()

            if ext == ".html":
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                rewritten = rewrite_html(content)
                if rewritten != content:
                    with open(fpath, "w", encoding="utf-8") as f:
                        f.write(rewritten)
                    html_count += 1

            elif ext == ".js" and fname in JS_FILES:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                rewritten = rewrite_js(content, fname)
                if rewritten != content:
                    with open(fpath, "w", encoding="utf-8") as f:
                        f.write(rewritten)
                    js_count += 1

    print(f"Rewrote {html_count} HTML files and {js_count} JS files.")
    print(f"Output: {dst}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify with a throwaway fixture (no real Kiln build needed)**

Run:
```bash
mkdir -p /tmp/kiln_rewrite_test
cat > /tmp/kiln_rewrite_test/index.html <<'EOF'
<html><head></head><body><a href="/about">About</a><script src="/app.js"></script></body></html>
EOF
cat > /tmp/kiln_rewrite_test/app.js <<'EOF'
const BASE_URL = "".replace(/\/$/, "");
EOF
python3 ~/Documents/Notes/.claude/scripts/kiln_rewrite.py --src /tmp/kiln_rewrite_test --dst /tmp/kiln_rewrite_out --base /wiki
```
Expected: `Rewrote 1 HTML files and 1 JS files.` followed by `Output: /tmp/kiln_rewrite_out`

- [ ] **Step 3: Verify the rewritten HTML**

Run: `cat /tmp/kiln_rewrite_out/index.html`
Expected: `<html><head></head><body><a href="/wiki/about">About</a><script src="/wiki/app.js"></script></body></html>`

- [ ] **Step 4: Verify the rewritten JS**

Run: `cat /tmp/kiln_rewrite_out/app.js`
Expected: `const BASE_URL = "/wiki";`

- [ ] **Step 5: Verify missing `--src` fails loudly**

Run: `python3 ~/Documents/Notes/.claude/scripts/kiln_rewrite.py --dst /tmp/x --base /wiki`
Expected: argparse error, exit code 2, message mentioning `--src` is required

- [ ] **Step 6: Clean up the fixture**

Run: `rm -rf /tmp/kiln_rewrite_test /tmp/kiln_rewrite_out`

---

### Task 3: `wiki-build.fish` — build the site locally

**Files:**
- Create: `~/.config/fish/functions/wiki-build.fish`

**Interfaces:**
- Consumes: `stage_wiki.py` (Task 1) via `python3 .../stage_wiki.py`
- Produces: `~/Documents/Static_Wiki/` (Kiln output) — consumed by Task 4's `wiki-publish.fish`

- [ ] **Step 1: Write the function**

```fish
# wiki-build — regenerate The Journal Wiki static site from Theology/Wiki/ using Kiln.
#
# Unlike vault-build (which mirrors the entire private Theology/ tree for local
# browsing), this stages only Theology/Wiki/ — the AI-maintained, source-
# synthesizing layer — with private-note links delinked to plain text, then
# builds that with Kiln.
#
# Usage:
#   wiki-build                 # full rebuild into ~/Documents/Static_Wiki
#   wiki-build --log debug     # any extra flags are passed straight through to `kiln generate`

function wiki-build --description 'Regenerate The Journal Wiki static site with Kiln'
    set -l staging ~/Documents/Wiki_Staging
    set -l out     ~/Documents/Static_Wiki

    echo "Step 1/2: Staging Theology/Wiki/ (delinking private notes)..."
    python3 ~/Documents/Notes/.claude/scripts/stage_wiki.py
    or return $status

    echo ""
    echo "Step 2/2: Building with Kiln..."
    kiln generate --input $staging --output $out --name "The Journal Wiki" $argv
    or return $status

    # --- Byzantine skin (post-build) ---------------------------------------
    set -l skin ~/.config/kiln/byzantine.css
    if test -f $skin
        cp $skin $out/byzantine.css
        set -l icon ~/.config/kiln/favicon.svg
        test -f $icon; and cp $icon $out/favicon.svg
        set -l tooltip ~/.config/kiln/bible_tooltip.js
        test -f $tooltip; and cp $tooltip $out/bible_tooltip.js
        set -l gtooltip ~/.config/kiln/glossary_tooltip.js
        test -f $gtooltip; and cp $gtooltip $out/glossary_tooltip.js
        set -l ver (date +%s)
        find $out -name '*.html' -exec sed -i \
            "s#</head>#<link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\"><link rel=\"stylesheet\" href=\"/byzantine.css?v=$ver\"><script src=\"/bible_tooltip.js\" defer></script><script src=\"/glossary_tooltip.js\" defer></script></head>#" {} +
    end

    # --- Bible reference auto-linker (post-build) ---------------------------
    if python3 ~/Documents/Notes/.claude/scripts/auto_link_bible.py $out
    else
        echo "  ⚠ Bible auto-link failed (site still usable)"
    end

    # --- Glossary auto-linker (post-build) -----------------------------------
    if python3 ~/Documents/Notes/.claude/scripts/auto_link_glossary.py $out
    else
        echo "  ⚠ Glossary auto-link failed (site still usable)"
    end
end
```

- [ ] **Step 2: Run it**

Run: `fish -c wiki-build`
Expected: exits 0; final output shows the bible/glossary auto-linker summaries (matching `vault-build`'s existing output shape)

- [ ] **Step 3: Verify the homepage renders `Wiki/index.md`**

Run: `grep -o "Wiki Index — Theology" ~/Documents/Static_Wiki/index.html`
Expected: `Wiki Index — Theology`

- [ ] **Step 4: Verify no stray unresolved link brackets reached the output**

Run: `grep -rl '\[\[' ~/Documents/Static_Wiki --include=*.html`
Expected: no output (no matches, exit code 1) — confirms `stage_wiki.py` caught every private link before Kiln ever saw it

- [ ] **Step 5: Verify the Byzantine skin applied**

Run: `test -f ~/Documents/Static_Wiki/byzantine.css && echo OK`
Expected: `OK`

- [ ] **Step 6: Manual spot-check (human verification)**

Run: `kiln serve --output ~/Documents/Static_Wiki --port 8081` and open `http://localhost:8081` in a browser. Confirm:
- Homepage shows the Wiki index/catalog
- Open `concept_theosis` — confirm the "Synthesized from N corpus notes" and "Daily readings" lists show plain, non-clickable citation text, while links like `concept_palamism_and_divine_energies` are still clickable and resolve
- Ctrl-C to stop the server when done

---

### Task 4: `wiki-publish.fish` — deploy pipeline

**Files:**
- Create: `~/.config/fish/functions/wiki-publish.fish`
- Delete: `~/.config/fish/functions/vault-publish.fish`

**Interfaces:**
- Consumes: `wiki-build` (Task 3), `kiln_rewrite.py --src/--dst/--base` (Task 2)
- Produces: `~/Documents/blog/static/wiki/` — consumed by Task 5's real publish run

Note on scope: the spec describes "the `vault-build.fish`/`vault-publish.fish` → `/notes/` pipeline" as retired together. Only `vault-publish.fish` is deleted here — `vault-build.fish` has no public-facing effect on its own (it only writes to `~/Documents/Static_Site`, which is local-only and not part of any git repo or deploy), and it predates the public-publish feature as a legitimate local full-vault preview tool (`kiln serve` against your own private notes). Deleting `vault-publish.fish` is what actually retires the `/notes/` *publish* path; `vault-build.fish`, `vault-watch.fish`, and `vault-serve.fish` are left alone.

- [ ] **Step 1: Write the function**

```fish
# wiki-publish — rebuild The Journal Wiki, rewrite paths for /wiki/, and deploy.

function wiki-publish --description "Rebuild The Journal Wiki, rewrite paths for /wiki/, and deploy to thecatechumensjournal.com"
    set -l blog ~/Documents/blog
    set -l rewrite_script ~/Documents/Notes/.claude/scripts/kiln_rewrite.py

    echo "Step 1/2: Building The Journal Wiki..."
    wiki-build; or return $status

    echo ""
    echo "Step 2/2: Rewriting paths for /wiki/ base and deploying..."
    python3 $rewrite_script --src ~/Documents/Static_Wiki --dst $blog/static/wiki --base /wiki
    or return $status

    git -C $blog add static/wiki/

    if git -C $blog diff --cached --quiet
        echo "No changes detected — site is already up to date."
        return 0
    end

    git -C $blog commit -m "Update Journal Wiki ($(date +%Y-%m-%d))"
    or return $status

    git -C $blog push origin main
    or return $status

    echo ""
    echo "Deployed → https://thecatechumensjournal.com/wiki/"
end
```

- [ ] **Step 2: Delete the old `/notes/` publish function**

Run: `rm ~/.config/fish/functions/vault-publish.fish`

- [ ] **Step 3: Verify the old function is gone and the new one is picked up**

Run: `test ! -f ~/.config/fish/functions/vault-publish.fish && echo "vault-publish removed"`
Expected: `vault-publish removed`

Run: `fish -c "functions -q wiki-publish; and echo defined"`
Expected: `defined`

---

### Task 5: First real publish — go live at `/wiki/`, stop new private exposure

**Files:**
- Modify: `~/Documents/blog/static/wiki/` (new, generated — not hand-edited)
- Modify: `~/Documents/blog/static/notes/` (deleted)

**Interfaces:**
- Consumes: `wiki-publish` (Task 4)

This is a real push to the public `blog` repo. Confirm with the user immediately before running Step 1 if any doubt remains — the spec already approved this as the intended outcome, but it's the first action with real, externally-visible effect.

- [ ] **Step 1: Run the real publish**

Run: `fish -c wiki-publish`
Expected: ends with `Deployed → https://thecatechumensjournal.com/wiki/`

- [ ] **Step 2: Stop new private content from being served — remove `static/notes/` in a normal commit**

This does not rewrite history (that's Task 6) — it just stops the *next* deploy from continuing to publish private content, immediately narrowing the exposure window.

Run:
```bash
cd ~/Documents/blog
git rm -r static/notes
git commit -m "$(cat <<'EOF'
Remove /notes/ — replaced by the curated /wiki/ site

The full-vault mirror at /notes/ published private content (daily
readings, personal debate/apologetics notes). Public publishing is now
scoped to Theology/Wiki/ only, served at /wiki/.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```
Expected: commit succeeds, push succeeds

- [ ] **Step 3: Verify the deploy succeeded**

Run: `gh run list --repo rcortezk9/blog --limit 1`
Expected: most recent run shows `completed  success`

- [ ] **Step 4: Verify the new site is live**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://thecatechumensjournal.com/wiki/`
Expected: `200` (may take a minute or two for GitHub Pages to finish deploying — if not 200 yet, wait and retry rather than treating it as a failure)

- [ ] **Step 5: Verify `/notes/` no longer serves current content**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://thecatechumensjournal.com/notes/`
Expected: `404` (once the Pages deploy from Step 2 finishes)

---

### Task 6: Git history purge (gated — requires live user confirmation)

**Files:**
- Modify: `~/Documents/blog/.git/` (history rewrite)

**Interfaces:**
- Consumes: a working, verified `/wiki/` site from Task 5

**STOP before Step 1.** Do not run any command in this task without asking the user for an explicit, fresh go-ahead in the moment — even though the spec approved this in principle, it is destructive and irreversible on GitHub's side once the force-push lands. Confirm the user has seen the live `/wiki/` site working (Task 5) and still wants to proceed.

- [ ] **Step 1: Confirm with the user, then create a clean orphan history**

Run:
```bash
cd ~/Documents/blog
git checkout --orphan clean-history
git add -A
git status --short
```
Expected: `git status --short` shows only currently-tracked files staged (no `static/notes/` — it was already removed in Task 5, Step 2); review this list before continuing

- [ ] **Step 2: Commit the clean state**

Run:
```bash
cd ~/Documents/blog
git commit -m "$(cat <<'EOF'
Clean history: public Journal Wiki only

Squashes all prior commit history, which contained private vault
content (daily readings, personal apologetics/debate notes naming
real individuals) published by earlier full-vault builds. Public
publishing going forward is scoped to Theology/Wiki/ only, served at
/wiki/.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds, single-commit history on `clean-history`

- [ ] **Step 3: Replace `main` with the clean history**

Run:
```bash
cd ~/Documents/blog
git branch -D main
git branch -m main
```
Expected: `clean-history` is now named `main`, old `main` is gone locally (still recoverable via `git reflog` for a short window if something goes wrong before the push)

- [ ] **Step 4: Force-push (irreversible — only after re-confirming with the user)**

Run:
```bash
cd ~/Documents/blog
git push origin main --force
```
Expected: push succeeds; old commits on `origin/main` become unreachable and will eventually be garbage-collected by GitHub

- [ ] **Step 5: Verify the deploy still works after the history rewrite**

Run: `gh run list --repo rcortezk9/blog --limit 1`
Expected: most recent run shows `completed  success`

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://thecatechumensjournal.com/wiki/`
Expected: `200`
