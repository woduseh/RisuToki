---
name: writing-translation-guides
description: 'Use when creating or revising a per-bot source-to-target-language translation guide. Captures character-specific register, address forms, and fixed renderings; not needed for translating a single passage.'
tags: ['translation', 'voice', 'localization']
related_tools: ['inspect_document', 'read_content', 'preview_edit', 'apply_edit']
---

# Bot Translation Guides

Record the translation decisions that cannot safely be inferred from the source alone: names and terms, relationship-dependent address forms, speech levels, deliberate non-translations, and voice features the source language cannot directly express.

Use the bot's actual voice and relationships. Do not introduce a universal intimacy ladder or invent new character states to fill a table. Where choices change by context, state the relevant condition and include contrasting examples when they resolve ambiguity.

For Korean-specific decisions, [KOREAN_REGISTER.md](KOREAN_REGISTER.md) identifies the distinctions a per-bot guide may need to preserve. General translation advice and a copy of the character sheet are unnecessary.

Deliver the requested guide or revision. Creating or editing a bot does not automatically require a translation guide, and this skill does not require English as the source language.

## Guides for Uimori

When the bot runs in Uimori, the guide Uimori uses lives in the card as `extensions.uimori.translationGuide` (`{ instructions, terms }`); a separate Markdown guide is not read. Path, limits, and the write route are in `targeting-uimori`. To convert an existing guide:

- Fixed renderings of names and terms become `terms` rows. A condition such as "only as a name" goes in `note`, not in `target`.
- Address forms, speech levels, voice, mixed-language rules, and contrasting examples become `instructions` prose. Tables that depend on relationships or context are written out as sentences, because `terms` cannot express conditions between characters.
- Keep a term only when it fixes a rendering the translator could otherwise vary; Uimori sends the whole guide with every translation.
