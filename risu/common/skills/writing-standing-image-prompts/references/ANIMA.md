# Anima Standing-Image Prompt Profile

Read this profile only when the target model is Anima, or the Anima-then-Illustrious two-pass workflow.

## Model behavior

- Anima responds to hybrid prompting: comma-separated tags followed by one natural-language English sentence that summarizes the whole figure. The trailing sentence raises detail and composition quality; do not omit it.
- Standing assets are shown inside a chat UI, so the background must stay minimal: a solid color matched to the character's theme or a simple pattern or effect, weighted, for example `(minimalist solid pale green background:1.2), simple background`.
- The user manages global quality and negative prompts in their own settings. Exclude `masterpiece`, `best quality`, `worst quality`, and every other shared quality or negative token; emit only the character's own prompt.

## Tag order

Write the tags in English, comma-separated, in this order:

1. Subject count and framing: `1girl`, `1boy`, `solo`; prefer `cowboy shot` or `three-quarter view` so face and attire stay legible, and use `full body` only when proportions matter.
2. Body, hair, and eyes.
3. Expression, pose, and mood.
4. Attire from outer layer to inner layer, with material and fit.
5. Weapons, props, and effects the character actually holds or wears.
6. Lighting plus the minimal background.
7. One natural-language summary sentence.

## Output

Label the final block `Anima Prompt`. Precede it with a two-line `Character Design Summary`: the one or two most distinctive appearance, attire, or prop points, and the proposed background color and mood. Omit negative prompts, generation settings, and alternate variants unless requested.

Example: `1girl, solo, cowboy shot, short silver hair, messy hair, emerald green eyes, cheerful smile, oversized black techwear jacket, white crop top, black shorts, holding a futuristic tablet, glowing holographic interface floating, (minimalist solid pale neon green background:1.2), simple background, soft bright lighting, vibrant colors, A cheerful genius hacker girl with messy silver hair wearing oversized techwear, confidently holding a glowing holographic tablet.`

## Anima-to-Illustrious two-pass variant

Some ComfyUI workflows draft composition with Anima and refine detail or image-to-image with an Illustrious (ILXL) checkpoint. When the user names this workflow:

- Default to a standard standing pose and the default outfit when the request does not say; ask at most one question, and only when a signature pose or special outfit would materially change the image.
- Emit an Anima prompt as above and a second block labeled `ILXL Prompt` that is tag-only: the same tags with underscores instead of spaces, no trailing sentence, no lighting tags, and `simple_background, grey_background` as the background.
- When the source text is abstract, make hidden or implied features explicit in tags, for example `hair_over_left_eye` for "hair covers one eye" and the specific garments a uniform implies.
