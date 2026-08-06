# /blog-hero — Design

Date: 2026-08-06
Status: Approved, pending implementation

## Context

The blog (`thecatechumensjournal.com`, Hugo + "orthodox" theme) has no hero
image concept today — post frontmatter only has `title`, `date`, `description`,
`summary`, `content_type`, `audio`, `theological_position`, `word_count`,
`primary_scripture`, `tags`. No `image`/`hero` field exists, and no layout
renders one.

The user wants a manually-invoked skill, `/blog-hero`, that generates a
Byzantine parchment/icon-style hero image for a given post using an AI image
model, reached via the fal.ai model aggregator (pay-as-you-go, no monthly
subscription — see the `/generate`-skill pattern the user researched, which
wraps aggregators like fal.ai/Kie.ai instead of a locked subscription service
like Higsfield). The user does not yet have a fal.ai API key.

## Goals

- `/blog-hero <post-slug>` generates 3 candidate hero images for that post,
  in the site's default Byzantine parchment/icon style, at 1200x630
- User reviews the 3 candidates and tells Claude which to keep
- Chosen image is saved into the post's hero slot; frontmatter is updated;
  the theme's post layout renders it
- Style is overridable per-post via a `--style` argument
- Every run shows an estimated cost and asks for confirmation before
  spending money
- Every run is logged locally (slug, prompt, model, cost, timestamp)
- API key lives in `pass`, not a plaintext file

## Non-Goals

- No automatic invocation from the `blog-post` skill or any other pipeline —
  manual only
- No OG/Twitter social-share image variants (may be a future skill)
- No multi-provider routing/fallback (fal.ai only, unlike the video's
  cheapest-first router across fal/Kie.ai/wavespeed)
- No budget cap enforcement across runs — just a per-run confirmation prompt

## Design

### Invocation

`/blog-hero <post-slug>` where `<post-slug>` matches a file in
`content/posts/<slug>.md`. Optional `--style "<override text>"` appends to
or replaces the default style block for that one invocation only (not
persisted).

### Prompt construction

The skill reads the post's `title`, `description`, and `tags` from
frontmatter and combines them with a fixed default style block:

> Byzantine parchment/icon aesthetic — gold, aged-paper texture,
> iconographic figures, muted earth-and-gold palette, consistent with an
> Eastern Orthodox devotional publication.

If `--style` is passed, it overrides the style portion of the prompt for
that run (title/description/tags context still included).

Three prompt variants are built from this base, each requesting a different
composition (wide banner composition / centered icon composition /
asymmetric composition) so the 3 candidates are meaningfully different, not
just re-rolls of the same seed.

### Generation

Calls the fal.ai API directly (small script, no heavy SDK) using one fixed
image model (exact model ID to be pinned during setup — a strong
general-purpose model such as `flux/dev` or equivalent available on fal at
implementation time). All 3 requests generate at 1200x630.

Before calling the API, the skill prints the estimated total cost for 3
images and asks for confirmation. If declined, no API calls are made.

### Review & selection

The 3 candidates save to `static/hero/_review/<slug>-1.jpg`,
`<slug>-2.jpg`, `<slug>-3.jpg`. The skill reports these paths and waits for
the user to pick one (e.g. "use #2"). On selection:

- The chosen file moves to `static/hero/<slug>.jpg`
- The other two candidates are deleted
- The post's frontmatter gains `hero: "hero/<slug>.jpg"`

### Layout rendering

The post layout (`layouts/posts/single.html` or wherever the theme's single
post template lives — to be confirmed during implementation) needs a small
template change to render the `hero` field as a banner image at the top of
the post, when present. Posts without a `hero` field render as they do
today (no broken image, no layout shift).

### Cost guard & logging

No persistent budget cap. Each run:
1. Prints estimated cost (3 images × per-image model price)
2. Asks for a yes/no confirmation before generating
3. On completion, appends one line to `static/hero/_log.jsonl`:
   `{slug, prompt_variants, model, cost, timestamp}`

### API key setup

One-time setup, done as part of implementation:
1. Sign up at fal.ai, generate an API key
2. Store it in `pass` (following the user's existing `pass-add` workflow)
3. The skill reads the key from `pass` at runtime — never written to a
   plaintext file or committed to git

## Open Questions (to resolve during implementation)

- Exact fal.ai model ID/pricing to pin (catalog changes; check at setup time)
- Exact path/name of the theme's single-post layout template
- Where the `pass` entry should live in the existing store namespace
  (e.g. `Imported/` per the current GPG key layout, or a new top-level entry)
