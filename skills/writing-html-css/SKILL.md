---
name: writing-html-css
description: 'Guides writing HTML and CSS for RisuAI charx and risum files. Covers the backgroundEmbedding field for persistent styles, the x-risu- class prefix requirement, empty line restrictions, CBS dynamic class injection, and practical UI patterns like status panels. Use when creating or editing CSS/HTML in backgroundEmbedding, regex OUT fields, or lorebook content.'
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
