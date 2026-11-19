# File Structures

This appendix routes to supported field references; it does not contain a complete container schema.

- `.risup`: `risu/prompts/docs/PRESET_FIELDS.md`.
- `.risum`: `risu/modules/docs/MODULE_FIELDS.md`.
- `.charx`: inspect the relevant structured surface with `inspect_document` and bounded `read_content`, and retain export-compatibility validation.
- Uimori-only `extensions.uimori` data: surface paths `/_card/data/extensions/uimori` (`.charx`) and `/_moduleData/module/extensions/uimori` (`.risum`); shapes and limits are in `targeting-uimori`. Surface writes that change these values are validated against Uimori's limits.

MCP clients can read the field guides with `inspect_document` using a guidance target and the guide's repository path.

Normalized editor surfaces are not a complete raw-container schema. State any remaining schema gap rather than following this reference back to the overview.
