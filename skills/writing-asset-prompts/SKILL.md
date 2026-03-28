---
name: writing-asset-prompts
description: 'Guides writing image generation prompts for character standing illustrations optimized for the Anima model. Covers the 6-step prompt pipeline (base framing, expression/pose, attire, props/effects, lighting/background, natural language summary), minimalist background strategy, and output format. Use when a user needs a standing image prompt from a character description.'
---

# Writing Asset Prompts (Anima Model)

Generates standing (profile) illustration prompts for character assets from character descriptions, optimized for the **Anima** image generation model.

## Core Principles

1. **Hybrid prompting** — Tag sequences + a natural language summary sentence at the end. The summary dramatically improves detail and composition.
2. **Minimalist backgrounds** — Standing images for chat UI need clean backgrounds. Use solid colors or simple patterns matching the character's theme.
3. **No quality tags** — Exclude `masterpiece, best quality, worst quality` etc. Users set these globally. Output only character-specific prompt content.

## 6-Step Prompt Pipeline

### Step 1: Base & Framing

- Subject count: `1girl`, `1boy`, `solo`
- Framing: Prefer `cowboy shot` (thigh-up) or `three-quarter view` (semi-profile) for face + outfit detail. Use `full body` only when full proportions are essential.
- Physical features: body type, hairstyle, hair color, eye color, etc.

### Step 2: Expression, Pose & Vibe

- Personality/mood through expression and pose
- Examples: `cheerful smile`, `arrogant expression`, `arms crossed`, `dynamic pose`, `mysterious aura`

### Step 3: Attire (Detailed Layering)

- Describe garments from outer to inner layer
- Specify materials and styles
- Examples: `oversized techwear jacket`, `black crop top`, `denim shorts`, `choker`, `thigh-high boots`

### Step 4: Weapons, Props & Effects

- Items held or worn, magical/sci-fi effects
- Examples: `holding a futuristic tablet`, `holographic interface floating`, `floating magical orbs`

### Step 5: Lighting & Minimalist Background

- Theme-appropriate lighting + forced simple background with weight emphasis
- Examples: `(minimalist solid pale green background:1.2)`, `simple background`, `soft lighting`

### Step 6: Natural Language Summary (Critical)

- **Final line** of the prompt: one English sentence summarizing the entire image
- Example: `A cheerful hacker girl in oversized techwear, holding a glowing holographic tablet.`

## Output Format

```
### 💡 Character Design Summary
- **Visual highlights:** (1-2 line summary of defining features, outfit, props)
- **Mood & background color:** (suggested background color and overall mood)

### 🎨 Anima Prompt
(Single comma-separated English prompt following Steps 1-6)
```

## Complete Example

**Input:** A cheerful, mischievous genius hacker girl. Short messy silver hair with emerald green eyes. Wears an oversized black techwear jacket over a crop top. Holds a tablet with floating hologram screens, grinning confidently.

**Output:**

### 💡 Character Design Summary

- **Visual highlights:** Messy silver hair with bright green eyes, hip oversized techwear with crop top, holographic tablet
- **Mood & background color:** Cyber-tech vibe with pale neon green solid background and bright lighting

### 🎨 Anima Prompt

1girl, solo, cowboy shot, short silver hair, messy hair, emerald green eyes, cheerful smile, confident and playful expression, oversized black techwear jacket, off-shoulder jacket, white crop top, black shorts, holding a futuristic tablet, glowing holographic interface floating, dynamic and energetic pose, (minimalist solid pale neon green background:1.2), simple background, no background, soft bright lighting, vibrant colors, cyberpunk aesthetic, A cheerful genius hacker girl with messy silver hair wearing oversized techwear, confidently holding a glowing holographic tablet.

## Best Practices

1. **Always end with the NL summary** — this is the biggest quality boost for Anima.
2. **Use weight emphasis `(tag:1.2)`** for the background to ensure minimalism.
3. **Be specific about clothing layers** — vague descriptions produce inconsistent results.
4. **Match background color to character theme** — warm characters get warm tones, cool characters get cool tones.
5. **Avoid contradictory tags** — `simple background` + `detailed cityscape` will produce muddy results.
