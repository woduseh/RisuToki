---
name: writing-html-css
description: 'Use when writing HTML/CSS for RisuAI backgroundEmbedding, lorebook content, regex display output, or CBS-rendered panels. Primary skill for RisuAI rendering constraints; hand restricted WYSIWYG output to writing-arca-html. Do not use when targeting a normal web frontend or HTML outside a RisuAI surface.'
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

## Minimal workflow

1. Identify the exact CSS and HTML surfaces and inspect existing source class names.
2. Design a namespaced container and selectors in `backgroundEmbedding`.
3. Build semantic HTML with CBS only where dynamic content or classes are required.
4. Minify the injected HTML/CBS boundary while keeping source CSS readable.
5. Preview representative states, including missing variables, long text, and mobile width.

Load `writing-cbs-syntax` only for CBS behavior, `writing-regex-scripts` for regex-stage semantics, and `writing-lorebooks` for activation/placement. Use `writing-arca-html` for paste-only WYSIWYG targets.

## Validation

Check source/prefixed class consistency, selector scoping, absence of blank-line parser hazards, correct surface placement, safe dynamic values, responsive overflow, and whether display-only content is mistakenly relied on as model-visible instruction.
