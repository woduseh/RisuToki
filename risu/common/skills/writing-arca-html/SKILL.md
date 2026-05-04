---
name: writing-arca-html
description: 'Guides writing HTML for limited WYSIWYG editors like Arca.live (아카라이브). Covers strict technical constraints (no CSS/JS, inline-only styling, no positioning/flexbox/grid/animations), creative design techniques within those limits, background wrapping strategies, and comment syntax. Use when creating introduction pages, character profiles, or any rich HTML content destined for paste into a WYSIWYG editor that strips advanced CSS.'
tags: ['html', 'wysiwyg', 'arca']
related_tools: ['search_in_field', 'read_field_range', 'replace_in_field', 'replace_in_field_batch']
---

# Writing HTML for Limited WYSIWYG Editors

## Agent Operating Contract

- **Use when:** the output will be pasted into a restricted WYSIWYG target such as Arca.live and must survive stripped CSS/JS.
- **Do not use when:** the HTML/CSS lives in RisuAI `backgroundEmbedding`, regex display output, CBS panels, or normal web/app code.
- **Read first:** this `SKILL.md`; constraints and validation rules come before templates.
- **Load deeper only if:** a project-specific character/profile reference is needed to choose visual identity.
- **Output/validation contract:** produce inline-only HTML with no CSS/JS blocks; verify forbidden properties, background-color behavior, comment syntax, and dark-background readability before delivery.

This skill covers designing rich, visually engaging HTML content for **restricted WYSIWYG editors** — specifically platforms like **Arca.live (아카라이브)** that strip most CSS features. The goal is to create immersive visual experiences within severe technical constraints.

> **Routing note.** Use this skill for HTML that will be pasted into restricted WYSIWYG targets like Arca.live. For HTML/CSS that lives inside RisuAI surfaces such as `backgroundEmbedding`, regex HTML, or CBS-styled panels, use `writing-html-css` instead.

## Core Philosophy

**BE CREATIVE AND ADAPTIVE.** Every character, worldview, and concept deserves a unique visual identity. Don't default to templates — deeply understand the content's theme, mood, and personality, then design something that captures its essence.

---

## Technical Constraints (Hard Limits)

Breaking any of these causes the design to fail silently or render incorrectly.

### Forbidden Elements & Attributes

| Category               | What's Blocked                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Tags**               | `<head>`, `<style>`, `<script>`, `<link>`                                                             |
| **Scripting**          | All JavaScript, event handlers (`onclick`, etc.), `<button>`                                          |
| **External resources** | External image URLs — images must be base64 or uploaded                                               |
| **CSS properties**     | `position`, `top`, `left`, `right`, `bottom`, `z-index`                                               |
| **Layout**             | `display: flex`, `display: grid`, `justify-content`, `align-items`, `flex-wrap`, `gap`                |
| **Visual effects**     | `transform`, `animation`, `@keyframes`, `filter`, `backdrop-filter`                                   |
| **Transparency**       | `opacity` property (but `rgba()` alpha in colors works)                                               |
| **Overflow**           | `overflow`, `overflow-x`, `overflow-y`, `scroll`                                                      |
| **Advanced CSS**       | CSS variables (`var(--x)`), pseudo-elements (`::before`), pseudo-classes (`:hover`), `@media` queries |

### Allowed (Use These)

| Category           | What Works                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Styling method** | `style="..."` inline attribute only                                                                                                      |
| **Colors**         | `color`, `background-color` (on simple/empty elements), `border-color`                                                                   |
| **Color formats**  | `#RRGGBB`, `rgb()`, `rgba()` — **avoid 8-digit hex** (`#RRGGBBAA`)                                                                       |
| **Typography**     | `font-size`, `font-weight`, `font-family`, `font-style`, `line-height`, `letter-spacing`, `text-align`, `text-decoration`, `text-shadow` |
| **Box model**      | `margin`, `padding`, `width`, `max-width`, `height`, `border`, `border-radius`, `box-shadow`                                             |
| **Display**        | `display: block`, `display: inline`, `display: inline-block`, `display: table`                                                           |
| **Interactive**    | `<details>` + `<summary>` for collapsible sections                                                                                       |
| **Structure**      | `<div>`, `<span>`, `<p>`, `<table>`, `<hr>`, `<br>`, headings, lists                                                                     |

### Comment Syntax

**HTML comments (`<!-- -->`) are automatically deleted** by the editor. Use zero-sized paragraphs instead:

```html
<!-- BAD — will be deleted -->
<!-- Section Start -->

<!-- GOOD — survives the editor -->
<p style="font-size: 0; margin: 0; padding: 0;">**--Section Start--**</p>
```

---

## Background Color Behavior (Critical)

This is the most important platform-specific behavior to understand.

### The Container Problem

On platforms with dark mode (like Arca.live), `background-color` is **selectively stripped**:

| Element Type                   | `background-color` | Example                                                                  |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------ |
| **Empty decorative divs**      | ✅ Works           | `<div style="height: 8px; background-color: #4a3e28;"></div>`            |
| **Content-bearing containers** | ❌ Stripped        | `<div style="background-color: #faf7f0; padding: 20px;">Text here</div>` |

The platform's dark mode CSS overrides `background-color` on any element that contains visible content (text, images, nested elements).

### Workarounds

**Strategy 1: Design for dark backgrounds (Recommended)**

Design with a dark color scheme from the start. Text colors and borders work reliably, and the platform's native dark background becomes your canvas.

```html
<div style="padding: 20px;">
  <div style="color: #e8dfc0; font-size: 28px; font-weight: 700;">Title</div>
  <div style="color: #c8bfa0; font-size: 14px; line-height: 1.8;">Body text</div>
</div>
```

**Strategy 2: Use empty divs for color accents**

Since empty/decorative divs retain their background-color, use them for visual effects:

```html
<!-- Gradient-like accent strip (works!) -->
<div style="height: 4px; background-color: #d4a843;"></div>
<div style="height: 3px; background-color: #b8943a;"></div>
<div style="height: 2px; background-color: #8a7030;"></div>

<!-- Content section (no background-color, relies on platform dark bg) -->
<div style="padding: 16px; border-left: 4px solid #d4a843;">
  <div style="color: #e8dfc0;">Content here</div>
</div>
```

**Strategy 3: Borders as visual containers**

Use `border` properties to create the illusion of contained sections:

```html
<div style="border: 2px solid #3a3020; border-radius: 12px; padding: 16px;">
  <div style="color: #c8bfa0;">This looks like a card without needing background-color</div>
</div>
```

### The `<table bgcolor>` Myth

`<table bgcolor="#color">` does NOT bypass the dark mode override. Do not attempt it.

---

## Document Structure

### Required Wrapper

Always wrap content in a `<body>` tag with the theme background. Even if the platform strips container backgrounds, the tag structure ensures correct pasting:

```html
<body style="margin: 0; padding: 0; background-color: #0c0c14; font-family: 'Noto Sans KR', sans-serif;">
  <p style="font-size: 0; margin: 0; padding: 0;">**--Main Container--**</p>
  <div style="background-color: #0c0c14; padding-bottom: 1px;">
    <!-- All content goes here -->
  </div>

  <p style="font-size: 0; margin: 0; padding: 0;">**--End Main Container--**</p>
</body>
```

### Vertical Flow

Layout must be **purely vertical** (mobile-friendly). No side-by-side columns. Stack everything top to bottom with strategic padding and margins.

---

## Creative Design Techniques

### Color & Atmosphere

| Mood                    | Palette Direction                                |
| ----------------------- | ------------------------------------------------ |
| Mysterious / Dark       | Deep purples, muted blues, silver accents        |
| Cheerful / Energetic    | Warm yellows, coral, bright accents              |
| Melancholic / Nostalgic | Muted earth tones, desaturated warm colors       |
| Futuristic / Tech       | Neon cyan/magenta on dark, monospace text        |
| Fantasy / Medieval      | Gold, parchment tones, ornate borders            |
| Horror                  | Deep reds on black, heavy shadows, tight spacing |

### Technique Quick Reference

| Technique                 | Implementation                                                                     | Notes                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Typography hierarchy**  | Vary `font-size` (48→13px), `letter-spacing`, `text-shadow`, `text-transform`      | Large title → spaced uppercase subtitle → comfortable body (`line-height: 1.8`) |
| **Borders as accents**    | `border-left: 8px solid #color` for cards; nest `border` divs for depth            | Replaces `background-color` which is stripped on content containers             |
| **Gradient simulation**   | Stack empty `<div>` with `height: 2-4px` and sequential colors (see example below) | Only way to simulate `linear-gradient` within constraints                       |
| **Collapsible sections**  | `<details>` + `<summary>` with styled text                                         | Reliable interactive element; style the `<summary>` for visual consistency      |
| **Decorative separators** | `<div>` with `height`+`background-color`, `border-top: dashed`, or symbol text     | Use `◆ ◇ ◆` centered text for thematic breaks                                   |
| **Background patterns**   | Alternating-color empty divs or `inline-block` `<span>` elements                   | Creates texture/rhythm; use sparingly above content sections                    |
| **Tables for data**       | `<table>` with inline `border-collapse`, styled `<td>` padding/borders             | Best option for stats, attributes, and comparison data                          |

```html
<!-- Gradient simulation with stacked empty divs -->
<div style="height: 2px; background-color: #1a1614;"></div>
<div style="height: 2px; background-color: #2a2218;"></div>
<div style="height: 2px; background-color: #3a3020;"></div>
<div style="height: 2px; background-color: #4a3e28;"></div>
<div style="height: 2px; background-color: #3a3020;"></div>
<div style="height: 2px; background-color: #2a2218;"></div>
<div style="height: 2px; background-color: #1a1614;"></div>
```

### Theme & Character Design Direction

| Category               | Examples                         | Key Techniques                                                                                 |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Cyberpunk / Tech**   | Hacker, Android, AI              | Neon `text-shadow` glow, monospace `font-family`, cyan/magenta accents                         |
| **Fantasy / Medieval** | Knight, Historical Figure        | Gold borders, serif fonts, ornate diamond separators, parchment text                           |
| **Horror / Dark**      | Dark settings, suspense          | Deep red accents, heavy `box-shadow`, claustrophobic small padding                             |
| **Cute / Kawaii**      | Cheerful characters              | Pastel border colors, large `border-radius`, emoji accents, generous padding                   |
| **Minimalist**         | Clean, modern designs            | Thin borders, whitespace, subtle gray accents, sans-serif                                      |
| **Character-specific** | Hikikomori, Ghibli, Social Media | Match the character's world — dim room aesthetics, soft watercolors, or platform UI recreation |

---

## Design Process

1. **Analyze the content** — Character personality? Setting? Target emotions?
2. **Choose visual direction** — Color palette, typography style, overall mood
3. **Plan sections** — Header → body → details → footer. Decide collapsible vs. always-visible.
4. **Apply techniques** — Borders, text-shadow, stacked-div gradients, decorative separators
5. **Ensure readability** — All text must be legible against the platform's dark background
6. **Test on target platform** — Paste into the actual editor and verify rendering

---

## Common Pitfalls

| Mistake                                  | Why It Fails                   | Fix                                               |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------- |
| Using `background-color` on content divs | Dark mode strips it            | Use borders/text color for visual structure       |
| Using `<!-- HTML comments -->`           | Editor deletes them            | Use `<p style="font-size: 0;">` comments          |
| Using 8-digit hex colors (`#RRGGBBAA`)   | Editor/sanitizer may not parse | Use `rgba(r, g, b, a)` instead                    |
| Using `opacity: 0.5`                     | Property is blocked            | Use `rgba()` alpha in color values                |
| Adding `<style>` blocks                  | Stripped entirely              | Inline `style=""` only                            |
| Side-by-side layout with flexbox/grid    | Blocked properties             | Vertical stack only, or use `<table>` for columns |
| Relying on `:hover` effects              | Pseudo-classes not supported   | Static styling only                               |
| Using external image URLs                | Blocked by CSP                 | Base64 encode or upload to platform               |

---

## Full Minimal Template

```html
<body style="margin: 0; padding: 0; background-color: #0c0c14; font-family: 'Noto Sans KR', sans-serif;">
  <p style="font-size: 0; margin: 0; padding: 0;">**--Main Container--**</p>
  <div style="background-color: #0c0c14; padding-bottom: 1px;">
    <p style="font-size: 0; margin: 0; padding: 0;">**--Header--**</p>
    <div style="padding: 40px 24px 20px; text-align: center;">
      <div style="font-size: 42px; font-weight: 900; color: #e8dfc0; text-shadow: 0 2px 12px rgba(0,0,0,0.4);">
        CHARACTER NAME
      </div>
      <div style="font-size: 13px; letter-spacing: 3px; color: #a09480; margin-top: 8px;">SUBTITLE OR TAGLINE</div>
    </div>

    <p style="font-size: 0; margin: 0; padding: 0;">**--Divider--**</p>
    <div style="height: 2px; background-color: #d4a843; margin: 0 24px;"></div>

    <p style="font-size: 0; margin: 0; padding: 0;">**--Body--**</p>
    <div style="padding: 24px; color: #c8bfa0; font-size: 14px; line-height: 1.8;">
      Main content goes here. Use borders and text colors for visual structure since background-color on content
      containers is unreliable.
    </div>

    <p style="font-size: 0; margin: 0; padding: 0;">**--Character Card--**</p>
    <div style="border-left: 6px solid #6a4fa0; padding: 16px 20px; margin: 12px 24px;">
      <div style="color: #d4c0f0; font-weight: 700; font-size: 16px;">Character Name</div>
      <div style="color: #a090c0; font-size: 13px; margin-top: 4px;">Role · Trait · Detail</div>
      <div style="color: #8a80a0; font-size: 13px; line-height: 1.7; margin-top: 8px;">
        Character description paragraph.
      </div>
    </div>

    <p style="font-size: 0; margin: 0; padding: 0;">**--Footer--**</p>
    <div style="text-align: center; padding: 30px 24px; color: #a09480; font-size: 12px;">◆ Footer text ◆</div>
  </div>

  <p style="font-size: 0; margin: 0; padding: 0;">**--End Main Container--**</p>
</body>
```

---

## Remember

These guidelines exist to help you create amazing, unique designs. **Don't default to templates.** Every project should look different because every character and world IS different. Be bold, be creative, and make something memorable.

## Smoke Tests

| Prompt                                                         | Expected routing                                                                                | Expected output                                           | Forbidden behavior                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| "Make an Arca.live intro page for this character."             | Primary: `writing-arca-html`; load character notes only as content reference.                   | Inline-only HTML that survives WYSIWYG stripping.         | Using `<style>`, JavaScript, flex/grid, positioning, or HTML comments. |
| "Convert this CSS panel into something I can paste into Arca." | Primary: `writing-arca-html`; use `writing-html-css` only to understand the source constraints. | A constrained WYSIWYG-safe rewrite plus validation notes. | Preserving unsupported CSS because it worked in RisuAI.                |

## Related Skills

| Skill              | Relationship                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `writing-html-css` | For HTML/CSS inside RisuAI surfaces (`backgroundEmbedding`, regex, lorebooks) — not WYSIWYG targets |
