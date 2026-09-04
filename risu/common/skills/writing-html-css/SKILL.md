---
name: writing-html-css
description: 'Use for HTML/CSS in RisuAI backgroundEmbedding, lorebooks, regex output, and CBS-rendered panels.'
tags: ['html', 'css', 'ui']
related_tools: ['read_content', 'preview_edit', 'apply_edit', 'manage_items', 'list_css', 'read_css']
---

# Writing HTML & CSS for RisuAI

## Placement

Put persistent `<style>` blocks in `backgroundEmbedding`; do not inject them repeatedly through regex output. Put rendered HTML in the lorebook, regex `editDisplay` output, or other intended content surface.

## Runtime constraints

- RisuAI rewrites source class attributes and CSS class selectors with `x-risu-` and scopes selectors under `.chattext`. Write normal source classes consistently and choose distinctive names; do not manually mix prefixed and unprefixed selectors.
- `:root` is unavailable because of scoping. Declare custom properties on a container class if needed.
- CBS resolves before HTML rendering. Treat CBS values containing user input as untrusted; do not let them become arbitrary markup.
- Blank lines and even line breaks between connected HTML/CBS blocks can create paragraph/text nodes and break flex/grid. Return injected UI as one continuous line.
- Do not use `<script>`; use Lua for logic. Avoid radio inputs with known parser issues.

Load `writing-cbs-syntax` only for CBS behavior, `writing-regex-scripts` for regex-stage semantics, and `writing-lorebooks` for activation/placement. Use `writing-restricted-wysiwyg-html` for sanitized paste-only WYSIWYG targets.
