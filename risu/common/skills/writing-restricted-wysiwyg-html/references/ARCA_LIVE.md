# Arca.live Restricted HTML Profile

Read this profile only for Arca.live or an explicitly Arca-compatible paste target.

## Constraints

- Use inline `style` only. Do not use `<head>`, `<style>`, `<script>`, `<link>`, JavaScript, event handlers, or buttons.
- Do not rely on external image URLs; use uploaded or embedded assets allowed by the target.
- Avoid positioning and layers; flex/grid; transforms, animations, filters; opacity; overflow/scroll; CSS variables; pseudo-elements/classes; and media queries.
- Use simple structural elements, typography, borders, padding and margins, `block`, `inline-block`, `table`, and `<details>/<summary>`.
- Prefer six-digit hex, `rgb()`, or `rgba()`; avoid eight-digit hex.
- HTML comments are stripped. If durable section markers are required, use a zero-sized paragraph containing marker text.

Content-bearing container backgrounds may be stripped by platform dark mode. Design on the native dark canvas, use readable text, borders, and shadows, and use empty decorative divs for color accents. `table bgcolor` does not bypass this behavior.

## Validation focus

Verify every forbidden tag, attribute, and property; dark-background contrast; mobile width; missing-image behavior; balanced tags; no dependency on stripped comments or backgrounds; and readable plain-text order.
