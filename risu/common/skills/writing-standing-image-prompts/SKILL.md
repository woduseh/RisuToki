---
name: writing-standing-image-prompts
description: 'Use when converting an established character design into one finished standing-image prompt for a named image model or prompt grammar. Primary skill for visual prompt assembly; hand verified Danbooru vocabulary to writing-danbooru-tags and unresolved identity design to authoring-media-mix. Do not use when generating the image or redesigning the character.'
tags: ['image-prompt', 'assets', 'standing-image']
related_tools: ['analyze_content', 'validate_content']
---

# Writing Standing-Image Prompts

## Outcome

Return a concise design summary and one target-ready prompt that preserves the character's recognizable visual signals while leaving the background subordinate.

## Workflow

1. Identify the target model or prompt grammar. Read only its matching profile when one exists; use [ANIMA.md](references/ANIMA.md) for Anima.
2. Establish subject count, character type, view, crop, camera distance, and silhouette.
3. Specify visible emotional state, gaze, posture, hands, weight distribution, and energy.
4. Describe attire from silhouette to layers, materials, fit, color placement, wear, and distinctive construction.
5. Include only identity-bearing props, weapons, markings, or effects, with clear placement and interaction.
6. Use lighting that reveals form and a simple low-detail background suitable for a standing asset unless the user requests a scene.
7. Render the result in the target grammar. Add a short natural-language identity and composition summary only when the target benefits from it.

Favor concrete visible details over personality adjectives. Resolve contradictions, avoid redundant quality boilerplate, and keep culturally or physically important details explicit. Use `writing-danbooru-tags` only when tags must be searched or validated; do not guess tag validity.

## Output and validation

Return `Character Design Summary` followed by one prompt labeled for the named target, or `Model-ready Prompt` when no target label is established. Do not add negative prompts, generation settings, or alternate variants unless requested.

Check subject count, crop, anatomy and pose compatibility, garment layering, prop placement, palette consistency, background simplicity, target-grammar fit, and whether the character remains recognizable without a name label.
