---
name: writing-restricted-wysiwyg-html
description: 'Use when producing paste-safe rich HTML for a restricted WYSIWYG editor that sanitizes markup, styles, or media. Primary skill for target-aware inline HTML; hand RisuAI surfaces to writing-html-css. Do not use when building normal web frontends or targeting editors that support ordinary stylesheets and scripts.'
tags: ['html', 'wysiwyg', 'sanitized-html']
related_tools: ['search_document', 'read_content', 'preview_edit', 'apply_edit']
---

# Restricted WYSIWYG HTML

## Outcome

Deliver a vertically flowing, mobile-readable HTML fragment whose hierarchy survives the named target's sanitizer and theme behavior.

## Target contract

Identify the target editor before fixing the markup contract. Use supplied or verified platform rules; do not assume that one editor's stripping behavior applies to every restricted WYSIWYG. Read [ARCA_LIVE.md](references/ARCA_LIVE.md) for Arca.live.

Unless the target explicitly supports them, avoid scripts, event handlers, external stylesheets, fragile positioned layouts, and meaning that depends on background color or remote media. Keep important information readable in plain-text order.

## Workflow

1. Extract the subject's mood, motif, hierarchy, and reading order instead of starting from a generic template.
2. Establish the target's allowed tags, attributes, CSS properties, asset policy, sanitizer behavior, and dark/light theme constraints.
3. Choose a palette with explicit contrast for title, body, muted text, borders, and accents.
4. Build a simple vertical wrapper, then stack title, summary, sections, quotes or data, media, and closing information.
5. Create hierarchy through typography, spacing, borders, dividers, indentation, and only those decorative surfaces the target preserves.
6. Keep important meaning in text rather than color alone, and avoid side-by-side structures that fail on mobile unless verified.
7. Return paste-ready HTML without explanatory prose inside it.

## Validation

Validate against the selected target contract: forbidden markup and CSS, balanced tags, theme contrast, mobile width, missing-media behavior, sanitizer-sensitive features, and readable plain-text order. For RisuAI chat HTML/CSS, hand off to `writing-html-css`.
