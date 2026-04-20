---
name: writing-html-css
description: 'Guides writing HTML and CSS for RisuAI charx and risum files. Covers the backgroundEmbedding field for persistent styles, the x-risu- class prefix requirement, empty line restrictions, CBS dynamic class injection, and practical UI patterns like status panels. Use when creating or editing CSS/HTML in backgroundEmbedding, regex OUT fields, or lorebook content.'
tags: ['html', 'css', 'ui']
related_tools: ['list_css', 'read_css', 'write_css', 'insert_in_css']
---

# Writing HTML & CSS for RisuAI

RisuAI renders HTML within chat messages and supports CSS styling, but its markdown+HTML dual parser has specific constraints. Follow these rules for reliable rendering.

## Where to Put CSS

| Location                              | Result                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| **backgroundEmbedding** (recommended) | Loaded once on page load. Efficient and consistent.                         |
| Regex script OUT field                | Re-injected on every match. Causes duplicate styles and performance issues. |

**Always declare `<style>` blocks in backgroundEmbedding**, not in regex scripts.

## Critical Constraints

### No empty lines or newlines between connected HTML/CBS tags

RisuAI's markdown parser is aggressive. If it encounters blank lines, or even just regular newlines (`\n`) between inline elements or CBS logic blocks (`{{#when...}}`), it may wrap the elements in unexpected `<p>` tags or insert text nodes (phantom spaces). This completely breaks `flex` or `grid` layouts.

**CRITICAL: Minify your HTML when returning it from Regex or Lorebooks.**

```html
<!-- BAD — The newline between {{/when}} and {{#when}} will cause layout shifts or <p> wrapping -->
{{#when::uiLang::vis::en}}
<button>English</button>
{{/when}} {{#when::uiLang::vis::kr}}
<button>한국어</button>
{{/when}}

<!-- GOOD — Write continuously on a single line (Minified) -->
{{#when::uiLang::vis::en}}<button>English</button>{{/when}}{{#when::uiLang::vis::kr}}<button>한국어</button>{{/when}}
```

```html
<!-- BAD — Empty lines break structure entirely -->
<div>
  <div>Content 1</div>

  <div>Content 2</div>
</div>
```

### The `x-risu-` class prefix

RisuAI automatically prefixes all CSS classes with `x-risu-` at render time. When using **chained class selectors** (no space between classes), you must manually add the prefix:

```css
/* BAD — won't match at runtime */
.status.active {
  color: green;
}

/* GOOD — manual prefix for chained selectors */
.status.x-risu-active {
  color: green;
}

/* OK — parent-child selectors (space-separated) work normally */
.parent .child {
  color: blue;
}
```

In HTML, write classes normally: `class="status active"`. The prefix is only needed in CSS selectors.

### Other restrictions

- `:root` selector — **not available**
- `<script>` tags — **not allowed** (use Lua for logic)
- `<input type="radio">` — parsing issues, **avoid**

## CBS + HTML Integration

CBS is processed **before** HTML rendering, enabling dynamic class names and content:

```html
<div class="{{getvar::status_class}}">
  <span>HP: {{getvar::hp}}/{{getvar::max_hp}}</span>
  {{#when::{{getvar::hp}}::<::20}}
  <span class="warning">Critical!</span>
  {{/when}}
</div>
```

## Practical Example: Status Panel

### 1. backgroundEmbedding (CSS)

```html
<style>
  .status-panel {
    background: linear-gradient(135deg, #667eea, #764ba2);
    border-radius: 12px;
    color: white;
    padding: 12px;
  }
  .status-panel.x-risu-stat {
    display: flex;
    justify-content: space-between;
  }
</style>
```

### 2. Regex OUT or lorebook content (HTML + CBS)

```html
<div class="status-panel">
  <div class="status-panel header">Character Status</div>
  <div class="status-panel stat">
    <span>Name:</span>
    <span>{{getvar::char_name}}</span>
  </div>
  <div class="status-panel stat">
    <span>HP:</span>
    <span>{{getvar::hp}}/{{getvar::max_hp}}</span>
  </div>
</div>
```

## Best Practices

1. **CSS in backgroundEmbedding, HTML in regex/lorebook** — separate concerns for performance.
2. **No blank lines in HTML** — always write tags continuously.
3. **Remember `x-risu-`** for chained class selectors.
4. **Use CBS for dynamic content** — variables, conditionals, and computed values work inside HTML attributes and content.
5. **Keep styles simple** — complex CSS animations and transitions work but can impact chat scrolling performance.

## Critical Gotchas

| Issue                                           | Detail                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty lines break layouts**                   | A single blank line between HTML tags causes the markdown parser to wrap elements in `<p>` tags and insert phantom margins, completely destroying flex/grid layouts. This is the #1 failure mode.                    |
| **`x-risu-` prefix for chained selectors only** | `.status.active` must be written as `.status.x-risu-active` in CSS. But parent-child selectors (`.parent .child`) work normally — the prefix is only required when two classes are chained without a space.          |
| **No `:root` selector**                         | CSS custom properties declared on `:root` won't work. Declare them on a container class instead (e.g., `.my-theme`).                                                                                                 |
| **All selectors are scoped to `.chattext`**     | The CSS processor prepends `.chattext` to every selector. This means `:root` declarations and any selector expecting document-level scope will silently fail. Design all selectors relative to the chat container.   |
| **CBS evaluates before HTML rendering**         | CBS `{{}}` tags in HTML are replaced with their values before the HTML is parsed. If a CBS variable contains raw HTML, it will be rendered — this can be useful but also dangerous if the variable holds user input. |
| **Regex OUT inherits these constraints**        | HTML injected via `editDisplay` regex scripts must follow the same minification and prefix rules. The regex OUT field is not a CSS-free zone.                                                                        |

## Related Skills

| Skill                   | Relationship                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `writing-cbs-syntax`    | CBS `{{}}` tags work inside HTML attributes and content for dynamic rendering       |
| `writing-regex-scripts` | Regex `editDisplay` OUT fields inject HTML that must follow these rules             |
| `writing-arca-html`     | For HTML destined for WYSIWYG editors (not RisuAI surfaces), use this skill instead |

## Smoke Tests

Use these prompts to verify the skill produces correct guidance:

1. "Create a status panel with HP/MP bars in `backgroundEmbedding` CSS and a lorebook entry for the HTML, using CBS variables."
2. "Why is my flex layout broken when I use `{{#when}}` blocks inside a div?"
3. "Write CSS for a `.card.active` compound class selector that works in RisuAI."
