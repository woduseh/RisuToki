---
name: writing-danbooru-tags
description: 'Guides validating, searching, and composing Danbooru tags for RisuAI asset prompts. Use when building image prompts or checking whether a tag is valid before saving prompt text.'
tags: ['danbooru', 'assets', 'image-prompts']
related_tools: ['validate_danbooru_tags', 'search_danbooru_tags', 'get_popular_danbooru_tags']
---

# Writing Danbooru Tags

## Agent Operating Contract

- **Use when:** the task is validating, searching, or composing Danbooru-style tags for RisuAI image prompts.
- **Do not use when:** the user wants a full character art prompt without tag validation/search, or actual image generation.
- **Read first:** this `SKILL.md`; it is a compact tool workflow.
- **Load deeper only if:** the tag set comes from a character art prompt (`writing-asset-prompts`) or an artifact field must be read first.
- **Output/validation contract:** keep only tags that materially affect the image, report invalid/ambiguous tags, and avoid inventing tags without search/validation.

Use this skill when a user needs **tag-based image prompts** for character art, or when you need to verify whether a Danbooru tag exists before suggesting it.

## Available MCP Tools

| Tool                                            | Use                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `validate_danbooru_tags(tags)`                  | Validate a batch of tags and receive suggestions for invalid ones |
| `search_danbooru_tags(query, category?)`        | Search by keyword or wildcard to discover candidate tags          |
| `get_popular_danbooru_tags(group_by_semantic?)` | Browse common tags by popularity or semantic group                |
| `danbooru_tag_guide`                            | Prompt template for rule summaries and starter tag sets           |

## Recommended Workflow

1. Read the relevant appearance fields or lorebook entries first.
2. Use `search_danbooru_tags` to discover likely tags.
3. Use `validate_danbooru_tags` on the full final set before writing prompt text.
4. Only keep tags that materially change the generated image.

## Tag Quality Rules

1. **Prefer concrete visual tags** over vague mood labels.
2. **Avoid contradictory tags** such as `simple background` with `detailed cityscape`.
3. **Do not add global quality boilerplate** like `masterpiece` or `best quality` unless the user explicitly wants them.
4. **Keep background tags minimal** for standing character assets unless the user asks for a complex scene.

## Common Prompt Flow

```text
1girl, silver hair, side braid, red eyes, military jacket, black gloves, thigh boots, stern expression, arms crossed, simple background
```

Then add a short natural-language summary only if the target model benefits from it.

## When Not to Use

- If the user needs **natural-language prompt writing**, prefer `writing-asset-prompts`.
- If the request is about **character design itself**, read `authoring-characters` first and convert the result into tags second.

## Related Skills

| Skill                   | Relationship                                                                  |
| ----------------------- | ----------------------------------------------------------------------------- |
| `writing-asset-prompts` | Use for the full 6-step prompt pipeline after validating tags with this skill |

## Smoke Tests

| Prompt                                                     | Expected routing                                                      | Expected output                           | Forbidden behavior                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| "Validate these Danbooru tags before I save the prompt."   | Primary: `writing-danbooru-tags`.                                     | Valid/invalid/ambiguous tag report.       | Treating unvalidated guesses as valid tags.                      |
| "Make a complete Anima standing prompt from this profile." | Primary: `writing-asset-prompts`; use this skill only for validation. | Full prompt plus optional tag validation. | Returning only a flat tag list when the user asked for a prompt. |
