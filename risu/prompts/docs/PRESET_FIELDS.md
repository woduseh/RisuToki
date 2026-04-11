# .risup Preset Field Reference

Reference for top-level fields and nested object shapes used in RisuAI `.risup` preset files.

> Binary format: `.risup` exports are RisuPack-encoded compressed msgpack envelopes containing an AES-GCM-encrypted msgpack `botPreset`. RisuAI export code uses `fflate` for compression. Sensitive/export-sanitized fields such as `openAIKey`, `proxyKey`, `forceReplaceUrl`, `forceReplaceUrl2`, `textgenWebUIStreamURL`, and `textgenWebUIBlockingURL` are commonly blanked on export.

---

## Identity & API

| Field                   | Type      | Default                    | Notes                          |
| ----------------------- | --------- | -------------------------- | ------------------------------ |
| `name`                  | `string?` | `"New Preset"`             | Preset display name.           |
| `apiType`               | `string?` | `"gemini-3-flash-preview"` | API/provider family key.       |
| `aiModel`               | `string?` | `"gemini-3-flash-preview"` | Primary model id.              |
| `subModel`              | `string?` | `"gemini-3-flash-preview"` | Secondary or alias model id.   |
| `currentPluginProvider` | `string?` | `""`                       | Active plugin provider id.     |
| `image`                 | `string?` | `""`                       | Preset thumbnail or image ref. |

---

## Auth & URLs

| Field                     | Type      | Default | Notes                                |
| ------------------------- | --------- | ------- | ------------------------------------ |
| `openAIKey`               | `string?` | `""`    | Secret; usually stripped on export.  |
| `proxyKey`                | `string?` | `""`    | Secret; usually stripped on export.  |
| `textgenWebUIStreamURL`   | `string?` | `""`    | Commonly blanked on export.          |
| `textgenWebUIBlockingURL` | `string?` | `""`    | Commonly blanked on export.          |
| `koboldURL`               | `string?` | `N/A`   | Optional Kobold endpoint.            |
| `forceReplaceUrl`         | `string?` | `""`    | Commonly blanked on export.          |
| `forceReplaceUrl2`        | `string?` | `""`    | Commonly blanked on export.          |
| `proxyRequestModel`       | `string?` | `N/A`   | Proxy-side request model override.   |
| `openrouterRequestModel`  | `string?` | `N/A`   | OpenRouter request model override.   |
| `customProxyRequestModel` | `string?` | `N/A`   | Custom proxy request model override. |

---

## Sampling Parameters

| Field                | Type      | Default | Notes                                           |
| -------------------- | --------- | ------- | ----------------------------------------------- |
| `temperature`        | `number`  | `80`    | `0–200` scale; divide by `100`.                 |
| `top_p`              | `number?` | `1`     | Probability mass sampler.                       |
| `top_k`              | `number?` | `N/A`   | Top-k sampler.                                  |
| `top_a`              | `number?` | `N/A`   | Top-a sampler.                                  |
| `min_p`              | `number?` | `N/A`   | Minimum probability sampler.                    |
| `repetition_penalty` | `number?` | `N/A`   | Repetition penalty.                             |
| `frequencyPenalty`   | `number`  | `70`    | `0–200` scale; divide by `100`.                 |
| `PresensePenalty`    | `number`  | `70`    | `0–200` scale; raw key spelling is intentional. |

---

## Context & Response

| Field              | Type        | Default | Notes                    |
| ------------------ | ----------- | ------- | ------------------------ |
| `maxContext`       | `number`    | `4000`  | Maximum context budget.  |
| `maxResponse`      | `number`    | `300`   | Maximum response budget. |
| `localStopStrings` | `string[]?` | `N/A`   | Local stop-string array. |

---

## Main Prompt Content

| Field               | Type       | Default                                                   | Notes                             |
| ------------------- | ---------- | --------------------------------------------------------- | --------------------------------- |
| `mainPrompt`        | `string`   | `(built-in default)`                                      | Legacy main prompt text.          |
| `jailbreak`         | `string`   | `(built-in default)`                                      | Legacy jailbreak text.            |
| `globalNote`        | `string`   | `""`                                                      | Legacy post-history note.         |
| `additionalPrompt`  | `string`   | `"The assistant must act as {{char}}. user is {{user}}."` | Compatibility helper prompt.      |
| `descriptionPrefix` | `string`   | `"description of {{char}}: "`                             | Prefix for description injection. |
| `autoSuggestPrompt` | `string?`  | `N/A`                                                     | Auto-suggest prompt text.         |
| `autoSuggestPrefix` | `string?`  | `N/A`                                                     | Auto-suggest prefix text.         |
| `autoSuggestClean`  | `boolean?` | `N/A`                                                     | Auto-suggest cleanup toggle.      |

---

## Prompt Template System

| Field                        | Type                   | Default                                                                                                      | Notes                            |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `promptTemplate`             | `PromptItem[]?`        | `N/A`                                                                                                        | Structured prompt item array.    |
| `formatingOrder`             | `FormatingOrderItem[]` | `['main','description','personaPrompt','chats','lastChat','jailbreak','lorebook','globalNote','authorNote']` | Message assembly order tokens.   |
| `customPromptTemplateToggle` | `string?`              | `""`                                                                                                         | Toggle-template text blob.       |
| `templateDefaultVariables`   | `string?`              | `""`                                                                                                         | Default CBS/template variables.  |
| `promptSettings`             | `PromptSettings?`      | `N/A`                                                                                                        | Nested prompt behavior settings. |
| `promptPreprocess`           | `boolean`              | `false`                                                                                                      | Preprocess assembled prompt.     |

---

## Instruction & Chat Templates

| Field                  | Type       | Default | Notes                             |
| ---------------------- | ---------- | ------- | --------------------------------- |
| `useInstructPrompt`    | `boolean?` | `false` | Enable instruct-style templating. |
| `instructChatTemplate` | `string?`  | `N/A`   | Instruct template selector/text.  |
| `JinjaTemplate`        | `string?`  | `""`    | Raw Jinja template text.          |

---

## Bias & Regex

| Field   | Type                 | Default | Notes                     |
| ------- | -------------------- | ------- | ------------------------- |
| `bias`  | `[string, number][]` | `[]`    | Token bias tuples.        |
| `regex` | `customscript[]?`    | `N/A`   | Preset-level regex rules. |

---

## Model-Specific: Ooba

| Field  | Type           | Default               | Notes                            |
| ------ | -------------- | --------------------- | -------------------------------- |
| `ooba` | `OobaSettings` | `(built-in defaults)` | Ooba generation settings object. |

### OobaSettings

| Field                        | Type      | Default               | Notes                          |
| ---------------------------- | --------- | --------------------- | ------------------------------ |
| `max_new_tokens`             | `number`  | `180`                 | Maximum new tokens.            |
| `do_sample`                  | `boolean` | `true`                | Enable stochastic sampling.    |
| `temperature`                | `number`  | `0.7`                 | Ooba-native temperature scale. |
| `top_p`                      | `number`  | `0.9`                 | Nucleus sampling value.        |
| `typical_p`                  | `number`  | `1`                   | Typical-p value.               |
| `repetition_penalty`         | `number`  | `1.15`                | Repetition penalty value.      |
| `encoder_repetition_penalty` | `number`  | `1`                   | Encoder repetition penalty.    |
| `top_k`                      | `number`  | `20`                  | Top-k sampler value.           |
| `min_length`                 | `number`  | `0`                   | Minimum generation length.     |
| `no_repeat_ngram_size`       | `number`  | `0`                   | N-gram repeat block size.      |
| `num_beams`                  | `number`  | `1`                   | Beam count.                    |
| `penalty_alpha`              | `number`  | `0`                   | Contrastive search penalty.    |
| `length_penalty`             | `number`  | `1`                   | Beam length penalty.           |
| `early_stopping`             | `boolean` | `false`               | Stop beams early.              |
| `seed`                       | `number`  | `-1`                  | Random seed.                   |
| `add_bos_token`              | `boolean` | `true`                | Insert BOS token.              |
| `truncation_length`          | `number`  | `4096`                | Context truncation length.     |
| `ban_eos_token`              | `boolean` | `false`               | Ban EOS token.                 |
| `skip_special_tokens`        | `boolean` | `true`                | Hide special tokens.           |
| `top_a`                      | `number`  | `0`                   | Top-a sampler value.           |
| `tfs`                        | `number`  | `1`                   | Tail free sampling value.      |
| `epsilon_cutoff`             | `number`  | `0`                   | Epsilon cutoff.                |
| `eta_cutoff`                 | `number`  | `0`                   | Eta cutoff.                    |
| `formating`                  | `object`  | `(built-in defaults)` | Ooba prompt wrapper fields.    |

### OobaSettings.formating

| Field             | Type      | Default                                                                                                       | Notes                            |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `header`          | `string`  | `"Below is an instruction that describes a task. Write a response that appropriately completes the request."` | Default instruct header.         |
| `systemPrefix`    | `string`  | `"### Instruction:"`                                                                                          | System block prefix.             |
| `userPrefix`      | `string`  | `"### Input:"`                                                                                                | User block prefix.               |
| `assistantPrefix` | `string`  | `"### Response:"`                                                                                             | Assistant block prefix.          |
| `seperator`       | `string`  | `""`                                                                                                          | Raw key spelling is intentional. |
| `useName`         | `boolean` | `false`                                                                                                       | Include speaker names.           |

---

## Model-Specific: NAI

| Field           | Type           | Default | Notes                    |
| --------------- | -------------- | ------- | ------------------------ |
| `NAISettings`   | `NAISettings?` | `N/A`   | NovelAI settings object. |
| `NAIadventure`  | `boolean?`     | `false` | Adventure mode toggle.   |
| `NAIappendName` | `boolean?`     | `false` | Append speaker names.    |

---

## Model-Specific: AIN

| Field       | Type          | Default               | Notes                           |
| ----------- | ------------- | --------------------- | ------------------------------- |
| `ainconfig` | `AINsettings` | `(built-in defaults)` | AIN generation settings object. |

### AINsettings

| Field           | Type     | Default  | Notes                   |
| --------------- | -------- | -------- | ----------------------- |
| `top_p`         | `number` | `0.7`    | Nucleus sampling value. |
| `rep_pen`       | `number` | `1.0625` | Repetition penalty.     |
| `top_a`         | `number` | `0.08`   | Top-a sampler value.    |
| `rep_pen_slope` | `number` | `1.7`    | Repetition slope.       |
| `rep_pen_range` | `number` | `1024`   | Repetition range.       |
| `typical_p`     | `number` | `1.0`    | Typical-p value.        |
| `badwords`      | `string` | `""`     | Blocked words text.     |
| `stoptokens`    | `string` | `""`     | Stop tokens text.       |
| `top_k`         | `number` | `140`    | Top-k sampler value.    |

---

## Model-Specific: Reverse Proxy

| Field                  | Type                               | Default              | Notes                                 |
| ---------------------- | ---------------------------------- | -------------------- | ------------------------------------- |
| `reverseProxyOobaArgs` | `OobaChatCompletionRequestParams?` | `{mode: 'instruct'}` | Reverse-proxy Ooba request overrides. |

---

## OpenRouter

| Field                | Type                                                   | Default | Notes                     |
| -------------------- | ------------------------------------------------------ | ------- | ------------------------- |
| `openrouterProvider` | `{order: string[], only: string[], ignore: string[]}?` | `N/A`   | Provider routing filters. |

### openrouterProvider

| Field    | Type       | Default | Notes                     |
| -------- | ---------- | ------- | ------------------------- |
| `order`  | `string[]` | `N/A`   | Preferred provider order. |
| `only`   | `string[]` | `N/A`   | Provider allow-list.      |
| `ignore` | `string[]` | `N/A`   | Provider deny-list.       |

---

## JSON Schema / Structured Output

| Field               | Type       | Default | Notes                            |
| ------------------- | ---------- | ------- | -------------------------------- |
| `jsonSchemaEnabled` | `boolean?` | `false` | Enable structured output schema. |
| `jsonSchema`        | `string?`  | `""`    | JSON Schema text.                |
| `strictJsonSchema`  | `boolean?` | `true`  | Enforce strict schema mode.      |
| `extractJson`       | `string?`  | `""`    | JSON extraction path/rule.       |

---

## Group Chat

| Field               | Type      | Default  | Notes                      |
| ------------------- | --------- | -------- | -------------------------- |
| `groupTemplate`     | `string?` | `""`     | Group chat template text.  |
| `groupOtherBotRole` | `string?` | `'user'` | Role for non-speaker bots. |

---

## System Override

| Field                      | Type                     | Default | Notes                            |
| -------------------------- | ------------------------ | ------- | -------------------------------- |
| `systemContentReplacement` | `string?`                | `N/A`   | Override emitted system content. |
| `systemRoleReplacement`    | `'user' \| 'assistant'?` | `N/A`   | Rewrite system-role messages.    |

---

## Custom API & Flags

| Field               | Type          | Default | Notes                           |
| ------------------- | ------------- | ------- | ------------------------------- |
| `customAPIFormat`   | `LLMFormat?`  | `0`     | Request format enum; see below. |
| `enableCustomFlags` | `boolean?`    | `N/A`   | Enable `customFlags`.           |
| `customFlags`       | `LLMFlags[]?` | `N/A`   | Capability flag enum list.      |

---

## Separate Parameters

| Field                       | Type       | Default | Notes                                |
| --------------------------- | ---------- | ------- | ------------------------------------ |
| `seperateParametersEnabled` | `boolean?` | `false` | Enable per-axis parameter overrides. |
| `seperateParameters`        | `object?`  | `N/A`   | Axis-specific parameter overrides.   |

### seperateParameters container

| Field       | Type                                 | Default | Notes                       |
| ----------- | ------------------------------------ | ------- | --------------------------- |
| `memory`    | `SeparateParameters`                 | `N/A`   | Memory-axis overrides.      |
| `emotion`   | `SeparateParameters`                 | `N/A`   | Emotion-axis overrides.     |
| `translate` | `SeparateParameters`                 | `N/A`   | Translation-axis overrides. |
| `otherAx`   | `SeparateParameters`                 | `N/A`   | Other-axis overrides.       |
| `overrides` | `Record<string, SeparateParameters>` | `N/A`   | Named override map.         |

### SeparateParameters

| Field                      | Type                                    | Default | Notes                             |
| -------------------------- | --------------------------------------- | ------- | --------------------------------- |
| `temperature`              | `number?`                               | `N/A`   | Axis-specific temperature.        |
| `top_k`                    | `number?`                               | `N/A`   | Axis-specific top-k.              |
| `repetition_penalty`       | `number?`                               | `N/A`   | Axis-specific repetition penalty. |
| `min_p`                    | `number?`                               | `N/A`   | Axis-specific min-p.              |
| `top_a`                    | `number?`                               | `N/A`   | Axis-specific top-a.              |
| `top_p`                    | `number?`                               | `N/A`   | Axis-specific top-p.              |
| `frequency_penalty`        | `number?`                               | `N/A`   | Axis-specific frequency penalty.  |
| `presence_penalty`         | `number?`                               | `N/A`   | Axis-specific presence penalty.   |
| `reasoning_effort`         | `number?`                               | `N/A`   | Axis-specific reasoning effort.   |
| `thinking_tokens`          | `number?`                               | `N/A`   | Axis-specific thinking budget.    |
| `thinking_type`            | `'off' \| 'budget' \| 'adaptive'?`      | `N/A`   | Axis-specific thinking mode.      |
| `adaptive_thinking_effort` | `'low' \| 'medium' \| 'high' \| 'max'?` | `N/A`   | Axis-specific adaptive effort.    |
| `outputImageModal`         | `boolean?`                              | `N/A`   | Axis-specific image-modal output. |
| `verbosity`                | `number?`                               | `N/A`   | Axis-specific verbosity.          |

---

## Separate Models

| Field                       | Type                                             | Default | Notes                      |
| --------------------------- | ------------------------------------------------ | ------- | -------------------------- |
| `seperateModelsForAxModels` | `boolean?`                                       | `false` | Enable per-axis model ids. |
| `seperateModels`            | `{memory, emotion, translate, otherAx: string}?` | `N/A`   | Axis-specific model ids.   |

### seperateModels

| Field       | Type     | Default | Notes                      |
| ----------- | -------- | ------- | -------------------------- |
| `memory`    | `string` | `N/A`   | Memory-axis model id.      |
| `emotion`   | `string` | `N/A`   | Emotion-axis model id.     |
| `translate` | `string` | `N/A`   | Translation-axis model id. |
| `otherAx`   | `string` | `N/A`   | Other-axis model id.       |

---

## Fallback Models

| Field                       | Type       | Default | Notes                          |
| --------------------------- | ---------- | ------- | ------------------------------ |
| `fallbackModels`            | `object?`  | `N/A`   | Per-axis fallback model lists. |
| `fallbackWhenBlankResponse` | `boolean?` | `false` | Retry when response is blank.  |

### fallbackModels

| Field       | Type       | Default | Notes                           |
| ----------- | ---------- | ------- | ------------------------------- |
| `memory`    | `string[]` | `N/A`   | Memory-axis fallback list.      |
| `emotion`   | `string[]` | `N/A`   | Emotion-axis fallback list.     |
| `translate` | `string[]` | `N/A`   | Translation-axis fallback list. |
| `otherAx`   | `string[]` | `N/A`   | Other-axis fallback list.       |
| `model`     | `string[]` | `N/A`   | Primary-model fallback list.    |

---

## Reasoning & Thinking

| Field                    | Type                                    | Default    | Notes                     |
| ------------------------ | --------------------------------------- | ---------- | ------------------------- |
| `reasonEffort`           | `number?`                               | `0`        | Generic reasoning effort. |
| `thinkingTokens`         | `number?`                               | `N/A`      | Thinking token budget.    |
| `thinkingType`           | `'off' \| 'budget' \| 'adaptive'?`      | `'budget'` | Thinking control mode.    |
| `adaptiveThinkingEffort` | `'low' \| 'medium' \| 'high' \| 'max'?` | `'high'`   | Adaptive thinking preset. |

---

## Network

| Field                    | Type       | Default | Notes                          |
| ------------------------ | ---------- | ------- | ------------------------------ |
| `localNetworkMode`       | `boolean?` | `false` | Enable local-network mode.     |
| `localNetworkTimeoutSec` | `number?`  | `600`   | Local-network timeout seconds. |

---

## Module & Tool Integration

| Field                | Type        | Default | Notes                        |
| -------------------- | ----------- | ------- | ---------------------------- |
| `moduleIntergration` | `string?`   | `""`    | Module integration key/text. |
| `modelTools`         | `string[]?` | `N/A`   | Tool ids exposed to model.   |

---

## Output & Verbosity

| Field              | Type             | Default | Notes                            |
| ------------------ | ---------------- | ------- | -------------------------------- |
| `outputImageModal` | `boolean?`       | `false` | Prefer image-modal output.       |
| `verbosity`        | `number?`        | `1`     | Verbosity level.                 |
| `dynamicOutput`    | `DynamicOutput?` | `N/A`   | Dynamic output behavior toggles. |

### DynamicOutput

| Field                   | Type      | Default | Notes                             |
| ----------------------- | --------- | ------- | --------------------------------- |
| `autoAdjustSchema`      | `boolean` | `N/A`   | Auto-adjust output schema.        |
| `dynamicMessages`       | `boolean` | `N/A`   | Dynamically vary messages.        |
| `dynamicMemory`         | `boolean` | `N/A`   | Dynamically vary memory output.   |
| `dynamicResponseTiming` | `boolean` | `N/A`   | Dynamically vary pacing/timing.   |
| `dynamicOutputPrompt`   | `boolean` | `N/A`   | Dynamically vary output prompt.   |
| `showTypingEffect`      | `boolean` | `N/A`   | Show typing-effect hints.         |
| `dynamicRequest`        | `boolean` | `N/A`   | Dynamically vary request payload. |

---

## Message Preset Info

| Field               | Type                 | Default | Notes                        |
| ------------------- | -------------------- | ------- | ---------------------------- |
| `messagePresetInfo` | `MessagePresetInfo?` | `N/A`   | Prompt preset metadata blob. |

### MessagePresetInfo

| Field           | Type              | Default | Notes                              |
| --------------- | ----------------- | ------- | ---------------------------------- |
| `promptName`    | `string?`         | `N/A`   | Human-readable prompt preset name. |
| `promptToggles` | `{key, value}[]?` | `N/A`   | Stored toggle key/value pairs.     |
| `promptText`    | `OpenAIChat[]?`   | `N/A`   | Stored chat message array.         |

---

## Prompt Item Types

### PromptItemPlain (`plain` / `jailbreak` / `cot`)

```json
{ "type": "plain", "type2": "main", "text": "You are...", "role": "system" }
```

### PromptItemTyped (`persona` / `description` / `lorebook` / `postEverything` / `memory`)

```json
{ "type": "description", "innerFormat": "{{slot}}" }
```

### PromptItemChat (`chat`)

```json
{ "type": "chat", "rangeStart": 0, "rangeEnd": "end" }
```

### PromptItemAuthorNote (`authornote`)

```json
{ "type": "authornote", "innerFormat": "{{slot}}", "defaultText": "" }
```

### PromptItemChatML (`chatML`)

```json
{ "type": "chatML", "text": "<|im_start|>system\\n..." }
```

### PromptItemCache (`cache`)

```json
{ "type": "cache", "name": "ctx-cache", "depth": 4096, "role": "all" }
```

---

## Formatting Order Tokens

Default order: `['main','description','personaPrompt','chats','lastChat','jailbreak','lorebook','globalNote','authorNote']`

| Field            | Type    | Default | Notes                         |
| ---------------- | ------- | ------- | ----------------------------- |
| `main`           | `token` | `Yes`   | Main prompt block.            |
| `description`    | `token` | `Yes`   | Character description block.  |
| `personaPrompt`  | `token` | `Yes`   | Persona prompt block.         |
| `chats`          | `token` | `Yes`   | Chat history block.           |
| `lastChat`       | `token` | `Yes`   | Latest chat message block.    |
| `jailbreak`      | `token` | `Yes`   | Jailbreak prompt block.       |
| `lorebook`       | `token` | `Yes`   | Lorebook injection block.     |
| `globalNote`     | `token` | `Yes`   | Global note block.            |
| `authorNote`     | `token` | `Yes`   | Author note block.            |
| `postEverything` | `token` | `No`    | Post-everything prompt block. |

---

## PromptSettings

| Field                  | Type       | Default | Notes                          |
| ---------------------- | ---------- | ------- | ------------------------------ |
| `assistantPrefill`     | `string`   | `""`    | Assistant-side prefill text.   |
| `postEndInnerFormat`   | `string`   | `""`    | Post-end wrapper text.         |
| `sendChatAsSystem`     | `boolean`  | `false` | Send chat history as system.   |
| `sendName`             | `boolean`  | `false` | Include speaker names.         |
| `utilOverride`         | `boolean`  | `false` | Override utility formatting.   |
| `customChainOfThought` | `boolean?` | `false` | Enable custom CoT handling.    |
| `maxThoughtTagDepth`   | `number?`  | `-1`    | Thought-tag depth cap.         |
| `trimStartNewChat`     | `boolean?` | `N/A`   | Trim leading new-chat content. |

---

## LLMFormat Values

| Field                  | Type     | Default | Notes                               |
| ---------------------- | -------- | ------- | ----------------------------------- |
| `OpenAICompatible`     | `number` | `0`     | OpenAI-compatible chat/completions. |
| `OpenAILegacyInstruct` | `number` | `1`     | Legacy OpenAI instruct format.      |
| `Anthropic`            | `number` | `2`     | Anthropic chat/messages format.     |
| `AnthropicLegacy`      | `number` | `3`     | Older Anthropic request format.     |
| `Mistral`              | `number` | `4`     | Mistral-native request format.      |
| `GoogleCloud`          | `number` | `5`     | Google Cloud format.                |
| `VertexAIGemini`       | `number` | `6`     | Vertex AI Gemini format.            |
| `NovelList`            | `number` | `7`     | NovelList format.                   |
| `Cohere`               | `number` | `8`     | Cohere format.                      |
| `NovelAI`              | `number` | `9`     | NovelAI format.                     |
| `WebLLM`               | `number` | `10`    | WebLLM format.                      |
| `OobaLegacy`           | `number` | `11`    | Legacy Ooba format.                 |
| `Plugin`               | `number` | `12`    | Plugin-provided format.             |
| `Ooba`                 | `number` | `13`    | Ooba chat-completions format.       |
| `Kobold`               | `number` | `14`    | Kobold format.                      |
| `Ollama`               | `number` | `15`    | Ollama format.                      |
| `Horde`                | `number` | `16`    | Horde format.                       |
| `AWSBedrockClaude`     | `number` | `17`    | AWS Bedrock Claude format.          |
| `OpenAIResponseAPI`    | `number` | `18`    | OpenAI Responses API format.        |
| `Echo`                 | `number` | `19`    | Echo/debug format.                  |
| `NanoGPT`              | `number` | `20`    | NanoGPT format.                     |
| `NanoGPTResponses`     | `number` | `21`    | NanoGPT Responses format.           |
| `NanoGPTMessages`      | `number` | `22`    | NanoGPT Messages format.            |
| `NanoGPTLegacy`        | `number` | `23`    | NanoGPT legacy format.              |

---

## LLMFlags Values

| Field                    | Type     | Default | Notes                                 |
| ------------------------ | -------- | ------- | ------------------------------------- |
| `hasImageInput`          | `number` | `0`     | Model accepts image input.            |
| `hasImageOutput`         | `number` | `1`     | Model can emit images.                |
| `hasAudioInput`          | `number` | `2`     | Model accepts audio input.            |
| `hasAudioOutput`         | `number` | `3`     | Model can emit audio.                 |
| `hasPrefill`             | `number` | `4`     | Assistant prefill is supported.       |
| `hasCache`               | `number` | `5`     | Cache controls are supported.         |
| `hasFullSystemPrompt`    | `number` | `6`     | Full system prompt is supported.      |
| `hasFirstSystemPrompt`   | `number` | `7`     | Only first system prompt is used.     |
| `hasStreaming`           | `number` | `8`     | Streaming responses are supported.    |
| `requiresAlternateRole`  | `number` | `9`     | Nonstandard role mapping required.    |
| `mustStartWithUserInput` | `number` | `10`    | First turn must be user.              |
| `poolSupported`          | `number` | `11`    | Pool routing is supported.            |
| `hasVideoInput`          | `number` | `12`    | Model accepts video input.            |
| `OAICompletionTokens`    | `number` | `13`    | Uses OAI completion-token accounting. |
| `DeveloperRole`          | `number` | `14`    | Developer role is supported.          |
| `geminiThinking`         | `number` | `15`    | Gemini thinking mode flag.            |
| `geminiBlockOff`         | `number` | `16`    | Gemini safety-block override flag.    |
| `deepSeekPrefix`         | `number` | `17`    | DeepSeek prefix handling.             |
| `deepSeekThinkingInput`  | `number` | `18`    | DeepSeek thinking in input.           |
| `deepSeekThinkingOutput` | `number` | `19`    | DeepSeek thinking in output.          |
| `noCivilIntegrity`       | `number` | `20`    | Disable civil-integrity filter path.  |
| `claudeThinking`         | `number` | `21`    | Claude thinking mode flag.            |
| `claudeAdaptiveThinking` | `number` | `22`    | Claude adaptive-thinking flag.        |

---

## Quirks & Gotchas

- Raw key spellings are legacy and intentional: `PresensePenalty`, `formatingOrder`, `moduleIntergration`, `seperateParameters`, `seperateModels`, and `seperator`.
- `temperature`, `frequencyPenalty`, and `PresensePenalty` use a `0–200` integer scale; divide by `100` for the common float-style value.
- RisuToki internally maps some raw preset keys to editor fields: `PresensePenalty` → `presencePenalty`, `bias` → `presetBias`, and `image` → `presetImage`.
- Auth/export-sanitized fields are commonly blanked on export: `openAIKey`, `proxyKey`, `forceReplaceUrl`, `forceReplaceUrl2`, `textgenWebUIStreamURL`, and `textgenWebUIBlockingURL`.
- `.risup` files in the wild may use gzip, zlib, or raw-deflate compression inside the msgpack/AES-GCM/RisuPack wrapper.
- `promptTemplate`, `formatingOrder`, `bias`, and `localStopStrings` are native arrays/objects in the file; editors may expose them through structured JSON/text UIs.
- Unknown or unsupported `promptTemplate` item shapes should be preserved, not normalized away.
- `PromptSettings` and other nested objects may round-trip even when a given editor does not surface every subfield directly.
- Enum families such as `LLMFormat` can grow over time; preserve unknown numeric values when round-tripping newer presets.
