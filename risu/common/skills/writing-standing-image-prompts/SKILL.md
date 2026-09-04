---
name: writing-standing-image-prompts
description: 'Use for image-model prompts from established character designs and Danbooru tag search or validation.'
tags: ['image-prompt', 'danbooru', 'assets', 'standing-image']
related_tools:
  ['analyze_content', 'validate_content', 'search_danbooru_tags', 'validate_danbooru_tags', 'get_popular_danbooru_tags']
---

# Standing-Image Prompts

Translate an established visual design into the requested model's prompt grammar. Use [ANIMA.md](references/ANIMA.md) when the user chooses the Anima or Anima-to-Illustrious recipe. Character design belongs to `authoring-bots`; this skill covers prompt translation and tag lookup.

For Danbooru-style prompts, use tag search to resolve uncertain spellings or aliases and batch validation for the final tag set. Recognizing a term is not evidence that the tag exists. Distinguish verified tags from unresolved guesses; keep visual details that the grammar cannot express as natural language where supported.
