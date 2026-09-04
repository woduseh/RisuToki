---
name: writing-restricted-wysiwyg-html
description: 'Use for paste-ready HTML in editors with sanitizer, style, or media restrictions.'
tags: ['html', 'wysiwyg', 'sanitized-html']
related_tools: ['search_document', 'read_content', 'preview_edit', 'apply_edit']
---

# Restricted WYSIWYG HTML

The target editor's sanitizer determines the markup contract. Use supplied or verified platform rules; one editor's stripping behavior does not establish another's. [ARCA_LIVE.md](references/ARCA_LIVE.md) records the repository's Arca.live compatibility profile.

Scripts, event handlers, stylesheets, positioning, and remote media depend on target support. Preserve reading order and essential meaning when optional styling or media disappears. Choose layout and output format for the actual content and request.

RisuAI chat rendering has a separate contract in `writing-html-css`.
