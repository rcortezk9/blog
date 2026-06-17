---
title: "Theoria: A Terminal Bible Reader for the Orthodox Study Bible"
date: 2026-06-16
draft: false
description: "Theoria is a Rust TUI for reading and annotating the Orthodox Study Bible with category-colored spans, cross-references, full-text search, and Byzantine parchment HTML export."
summary: "Most Bible apps treat Scripture as a Protestant text. Theoria is a terminal-first reader built specifically for the Orthodox Study Bible — with LXX numbering, deuterocanonical books, patristic cross-references, and automatic theological annotation."
content_type: project
tags:
  - theoria
  - orthodox-study-bible
  - rust
  - terminal
  - tools
---

## What It Is

Theoria is a terminal Bible reader written in Rust. It reads the full text of the Orthodox Study Bible from a local SQLite database and renders it with automatic, color-coded annotations across eleven theological categories — divine names, theophanies, typological prefigurations, people, places, and more.

It is not a general-purpose Bible app. It was built for one text and one tradition.

## Why the Orthodox Study Bible

Every Bible TUI I could find assumes a Protestant canon and Masoretic numbering. The Orthodox Study Bible is different in ways that matter:

**The Septuagint as base text.** The OSB Old Testament follows the Septuagint (LXX), the Greek translation used by the Apostles, the Fathers, and the Orthodox Church to this day. This is not an academic preference — it is the text of the liturgy. Psalm numbering, book names (1-4 Kingdoms instead of 1-2 Samuel / 1-2 Kings), and even verse divisions differ from Protestant Bibles.

**The deuterocanonical books.** Tobit, Judith, Wisdom of Solomon, Sirach, Baruch, 1-4 Maccabees, the Prayer of Manasseh, the Odes — these are present in the OSB and fully supported in Theoria. They are not an afterthought.

**Patristic commentary tradition.** The OSB footnotes draw from the Church Fathers. Theoria's cross-reference and typology systems are designed to surface these patristic readings — the ram in Genesis 22 as a type of the Crucifixion, the burning bush as a type of the Theotokos, Melchizedek's bread and wine as a type of the Eucharist.

## Features

### Automatic Annotation

Every verse is automatically scanned and annotated with colored spans across eleven categories:

| Category | Color | Style |
|----------|-------|-------|
| Divine Names | Purple | **Bold** |
| Angel of the LORD | Gold | **Bold** |
| Theophany | Gold-orange | |
| LXX Divine | Violet | |
| People | Blue | |
| People Groups | Light blue | |
| Places | Green | |
| Time | Yellow-brown | |
| Numbers | Gray | |
| Typology | Green | *Italic* |
| Imperatives | Red | |

Annotations are generated using Aho-Corasick pattern matching with word-boundary enforcement, plus a curated set of manual typological overlays.

### Psalm LXX/MT Dual Numbering

When viewing Psalms, Theoria displays both the LXX number (used by the OSB and the Orthodox Church) and the Masoretic/Protestant number:

```
PSA 22:1 [MT 23]     The Lord is my shepherd; I shall not want.
```

The full mapping covers all divergences — the split Psalms (LXX 9 = MT 9-10), the offset ranges, and the LXX-only Psalm 151.

### Cross-References

Theoria maintains a curated set of OT-NT cross-references that display automatically and bidirectionally:

```
GEN 1:1              In the beginning God created the heavens and the earth.
                     ↳ JHN 1:1 — "In the beginning was the Word" (allusion)
```

Navigate to the linked verse with `r`. When viewing JHN 1:1, the reverse link back to GEN 1:1 appears. Cross-references are categorized as quotations, allusions, fulfillments, or echoes.

### Full-Text Search

```
:search God @divine_names
```

Search across all 35,000+ verses with optional category filtering. Results appear in a dedicated pane with the search term highlighted. Category filters use AND logic — `:search lamb @typology` returns only verses containing "lamb" that also have a typological annotation.

### Named Sessions

```
:save pauline-epistles
:load pauline-epistles
```

Save and restore workspace configurations by name. Reading position is preserved — if you were at Romans 8 when you saved, `n` picks up at Romans 9 after loading.

### HTML Export

```
:export
:export John 1
:export > ~/study/genesis.html
```

Export the current workspace or any chapter to a self-contained HTML file with Byzantine parchment styling — warm background, Cinzel headings, EB Garamond body text, responsive layout. Category colors, cross-references, and the legend are all included.

### Navigation

| Key | Action |
|-----|--------|
| `:get Book CH:V` | Load a verse or chapter |
| `n` / `p` | Next / previous chapter |
| `j` / `k` | Scroll |
| `r` | Navigate to cross-referenced verse |
| `e` | Quick-export to HTML |
| `c` | Clear workspace |
| `?` | Help overlay |

The query bar accepts full book names, standard abbreviations, and LXX aliases (`:get 1 Kingdoms 1` resolves to 1 Samuel).

## Architecture

Theoria is a four-crate Rust workspace:

- **theoria-core** — Types, SQLite schema, verse reference parser, LXX/MT psalm mapping. No UI dependencies.
- **theoria-annotator** — Aho-Corasick pattern matchers, manual typology overlay, cross-reference loader.
- **theoria-importer** — CLI tool that reads the OSB flat text export and populates the database with verses, annotation spans, and cross-references.
- **theoria** — The TUI binary, built on ratatui 0.30 and crossterm 0.29.

The database holds 35,232 verses and 41,162 annotation spans. Verse lookup, annotation, and cross-reference queries are all indexed.

## The Name

*Theoria* (θεωρία) in the Orthodox tradition refers to the spiritual vision or contemplation of God — the direct perception of divine truth that goes beyond intellectual analysis. It is the goal of the ascetic life and the fruit of prayer.

A Bible reader named Theoria is an aspiration, not a claim.
