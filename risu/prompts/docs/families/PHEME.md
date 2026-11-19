# Phēmē Prompt Family

Phēmē is maintained in its own local Git repository at `risu/prompts/phēmē/`, which RisuToki ignores. That repository is the sole owner of Phēmē's design contract, sources, controls, versions, generator, and release workflow. RisuToki keeps this route and the generic `prompt-family` and `writing-risup-presets` skills, not copies of Phēmē facts.

For Phēmē work, read these files in that repository:

- `AGENTS.md`: family invariants, artifact ownership, the cached-prefix approval boundary, review focus, and release steps.
- `README.md`: layout, generation and preset synchronization commands, current controls, upgrade mappings, Uimori packaging, and known limitations.
- `CHANGELOG.md` and `src/pheme-source.md`: the current version and its changes.

Without that repository, Phēmē's sources are not available in the workspace; work from the supplied `.risup` artifacts with the generic skills. A prompt-only Phēmē release does not change the RisuToki product version or changelog.
