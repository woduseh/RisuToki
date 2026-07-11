---
name: writing-arca-html
description: 'Use when producing rich HTML for Arca.live or another restricted WYSIWYG editor that strips CSS and scripts. Primary skill for paste-safe inline HTML; hand RisuAI surfaces to writing-html-css. Do not use when targeting backgroundEmbedding, normal web frontends, or a target that supports stylesheets.'
tags: ['html', 'wysiwyg', 'arca']
related_tools: ['search_document', 'read_content', 'preview_edit', 'apply_edit']
---

# Restricted WYSIWYG HTML

## Outcome

Deliver a vertically flowing, mobile-readable HTML fragment whose visual hierarchy survives Arca-style sanitization and dark-mode overrides.

## Hard constraints

- Use inline `style` only. Do not use `<head>`, `<style>`, `<script>`, `<link>`, JavaScript, event handlers, or buttons.
- Do not rely on external image URLs; use uploaded or embedded assets allowed by the target.
- Avoid positioning and layers; flex/grid; transforms, animations, filters; opacity; overflow/scroll; CSS variables; pseudo-elements/classes; and media queries.
- Use simple structural elements, typography, borders, padding/margins, `block`/`inline-block`/`table`, and `<details>/<summary>`.
- Prefer six-digit hex, `rgb()`, or `rgba()`; avoid eight-digit hex.
- HTML comments are stripped. If durable section markers are required, use a zero-sized paragraph containing marker text.

Content-bearing container backgrounds may be stripped by platform dark mode. Design on the native dark canvas, use readable text/borders/shadows, and use empty decorative divs for color accents. `table bgcolor` does not bypass this behavior.

## Minimal workflow

1. Extract the subject's mood, motif, hierarchy, and reading order. Do not start from a generic template.
2. Choose a dark-compatible palette with explicit contrast for title, body, muted text, borders, and accents.
3. Build one vertical wrapper, then stack title, summary, sections, quotes/data, media, and closing information.
4. Create hierarchy through typography, spacing, border weight, dividers, indentation, and empty accent bars.
5. Keep important meaning in text, not color alone. Avoid side-by-side structures that collapse on mobile.
6. Return paste-ready HTML without explanatory prose inside it.

## Validation

Scan for every forbidden tag, attribute, and property. Verify dark-background contrast, mobile width, missing-image behavior, balanced tags, no dependency on stripped comments/backgrounds, and readable plain-text order. For RisuAI chat HTML/CSS, hand off to `writing-html-css` instead.
