---
name: writing-danbooru-tags
description: 'Use when searching, validating, or composing Danbooru-style tags for a RisuAI image prompt. Primary skill for tag correctness; hand full natural-language prompt assembly to writing-asset-prompts. Do not use when generating an image or the character design is unresolved.'
tags: ['danbooru', 'assets', 'image-prompts']
related_tools:
  ['analyze_content', 'validate_content', 'search_danbooru_tags', 'validate_danbooru_tags', 'get_popular_danbooru_tags']
---

# Writing Danbooru Tags

## Workflow

1. Read only the appearance details relevant to the image.
2. Search candidate tags instead of inventing spellings or aliases.
3. Compose a set ordered from subject/framing through body, hair/face, clothing, pose/expression, props, lighting, and background.
4. Validate the complete final set in one batch and resolve invalid or ambiguous results.
5. Remove tags that do not materially change the image.

Prefer concrete visible tags over mood labels. Avoid contradictions, duplicate concepts, global quality boilerplate such as `masterpiece` unless requested, and complex backgrounds for standing assets unless the user wants a scene.

## Output and validation

Return valid tags, invalid/ambiguous tags with verified alternatives, and any unresolved visual conflict. Do not claim an unvalidated guess is valid. Hand complete prose prompt construction to `writing-asset-prompts`.
