---
name: writing-asset-prompts
description: 'Use when converting an established character design into one finished standing-image prompt, especially for the Anima model. Primary skill for prompt assembly; hand tag verification to writing-danbooru-tags and identity design to authoring-media-mix. Do not use when generating an image or the character design is unresolved.'
tags: ['image-prompt', 'assets', 'anima']
related_tools: ['analyze_content', 'validate_content']
---

# Writing Standing-Image Prompts

## Outcome

Return a concise design summary and a model-ready prompt that preserves the character's recognizable visual signals while leaving the background subordinate.

## Six-step workflow

1. **Base and framing:** subject count, character type, view, crop, camera distance, and silhouette.
2. **Expression, pose, and vibe:** visible emotional state, gaze, posture, hands, weight distribution, and energy.
3. **Attire:** silhouette first, then layered garments, materials, fit, color placement, wear, and distinctive construction.
4. **Props and effects:** include only identity-bearing objects, weapons, markings, or effects; state placement and interaction.
5. **Lighting and background:** use lighting that reveals form and a simple, low-detail background suitable for a standing asset unless the user requests a scene.
6. **Natural-language summary:** restate identity and composition in coherent prose when the target model benefits from it.

Favor concrete visible details over personality adjectives. Resolve contradictions, avoid redundant quality boilerplate, and keep culturally or physically important details explicit. Use `writing-danbooru-tags` only when tags must be searched or validated; do not guess tag validity.

## Output

Return:

1. `Character Design Summary` — silhouette, palette, key materials, identity signals, and intended mood.
2. `Anima Prompt` — ordered visual tokens/phrases plus a short coherent summary when useful.

Do not add negative prompts, generation settings, or alternate variants unless requested.

## Validation

Check subject count, crop, anatomy/pose compatibility, garment layering, prop placement, palette consistency, background simplicity, and whether the character remains recognizable without a name label.
