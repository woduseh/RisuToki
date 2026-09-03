---
name: writing-standing-image-prompts
description: 'Use when converting an established character design into one finished standing-image prompt for a named image model or prompt grammar, or when searching, validating, or composing Danbooru-style tags for a RisuAI image prompt. Primary skill for visual prompt assembly and tag correctness; hand unresolved identity design to authoring-media-mix. Do not use when generating the image or redesigning the character.'
tags: ['image-prompt', 'danbooru', 'assets', 'standing-image']
related_tools:
  ['analyze_content', 'validate_content', 'search_danbooru_tags', 'validate_danbooru_tags', 'get_popular_danbooru_tags']
---

# Writing Standing-Image Prompts

## Outcome

Return a concise design summary and one target-ready prompt that preserves the character's recognizable visual signals while leaving the background subordinate. When the request is only about tags, return a validated tag set instead.

## Workflow

1. Identify the target model or prompt grammar. Read only its matching profile when one exists; use [ANIMA.md](references/ANIMA.md) for Anima and the Anima-to-Illustrious two-pass variant.
2. Read only the appearance details relevant to the image, then establish subject count, character type, view, crop, camera distance, and silhouette.
3. Specify visible emotional state, gaze, posture, hands, weight distribution, and energy.
4. Describe attire from silhouette to layers, materials, fit, color placement, wear, and distinctive construction.
5. Include only identity-bearing props, weapons, markings, or effects, with clear placement and interaction.
6. Use lighting that reveals form and a simple low-detail background suitable for a standing asset unless the user requests a scene.
7. Render the result in the target grammar. Add a short natural-language identity and composition summary only when the target benefits from it.

Favor concrete visible details over personality adjectives. Resolve contradictions, avoid redundant quality boilerplate, and keep culturally or physically important details explicit.

## Danbooru tags

When the target grammar is tag-based, search candidate tags instead of inventing spellings or aliases; recognizing a tag is not validation. Order the set from subject and framing through body, hair and face, expression and pose, clothing, props, lighting, and background. Validate the complete final set in one batch, resolve invalid or ambiguous results with verified alternatives, and remove tags that do not materially change the image. Prefer concrete visible tags over mood labels. Avoid contradictions, duplicate concepts, global quality boilerplate such as `masterpiece` unless requested, and complex backgrounds for standing assets unless the user wants a scene. Do not claim an unvalidated guess is valid.

## Output and validation

Return `Character Design Summary` followed by one prompt labeled for the named target, or `Model-ready Prompt` when no target label is established. For a tag-only request, return valid tags, invalid or ambiguous tags with verified alternatives, and any unresolved visual conflict. Do not add negative prompts, generation settings, or alternate variants unless requested.

Check subject count, crop, anatomy and pose compatibility, garment layering, prop placement, palette consistency, background simplicity, target-grammar fit, tag validity, and whether the character remains recognizable without a name label.
