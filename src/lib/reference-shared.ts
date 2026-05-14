export type ReferenceFileType = 'charx' | 'risum' | 'risup';
export type GreetingType = 'alternate' | 'group';
export type GreetingFieldName = 'alternateGreetings' | 'groupOnlyGreetings';

// ---------------------------------------------------------------------------
// Shared reference scalar-field definitions
// ---------------------------------------------------------------------------
// Single source of truth for which scalar fields are exposed on references.
// Used by sidebar-refs, refs-popout-data, mcp-api-server (list / read), and
// openRefTabById so they never drift out of sync.

export interface RefScalarFieldDef {
  /** Field key on the reference data object. */
  id: string;
  /** Human-readable label (Korean UI). */
  label: string;
  /** Editor language hint (used by sidebar tab). */
  lang: string;
  /** If true the value is a string-array, not a plain string. */
  isArray?: boolean;
}

/**
 * Scalar fields exposed on reference files — shared across all consumers.
 *
 * Order matters: sidebar/popout render fields in this order.
 * Complex surfaces (lua, css, lorebook, regex) are handled separately.
 */
export const REF_SCALAR_FIELDS: readonly RefScalarFieldDef[] = [
  { id: 'globalNote', label: '글로벌노트', lang: 'plaintext' },
  { id: 'firstMessage', label: '첫 메시지', lang: 'html' },
  { id: 'triggerScripts', label: '트리거 스크립트', lang: 'json' },
  { id: 'alternateGreetings', label: '추가 첫 메시지', lang: 'json', isArray: true },
  { id: 'description', label: '설명', lang: 'plaintext' },
  { id: 'defaultVariables', label: '기본 변수', lang: 'plaintext' },
] as const;

/**
 * Scalar field IDs that are simple strings (not arrays) and can be read via
 * the generic `read_reference_field` MCP route.
 */
export const REF_ALLOWED_READ_FIELDS: readonly string[] = [
  'lua',
  'css',
  'name',
  ...REF_SCALAR_FIELDS.filter((f) => !f.isArray).map((f) => f.id),
] as const;

export function getGreetingFieldName(greetingType: string): GreetingFieldName | null {
  if (greetingType === 'alternate') return 'alternateGreetings';
  if (greetingType === 'group') return 'groupOnlyGreetings';
  return null;
}

function getFileExtension(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() || '';
  const dotIndex = baseName.lastIndexOf('.');
  return dotIndex >= 0 ? baseName.slice(dotIndex).toLowerCase() : '';
}

/**
 * Derive a stable fileType string from a reference record's data or fileName.
 */
export function getRefFileType(ref: { fileName?: string; data?: Record<string, unknown> }): ReferenceFileType {
  if (ref.data && (ref.data._fileType === 'risum' || ref.data._fileType === 'risup')) return ref.data._fileType;
  const ext = getFileExtension(ref.fileName || '');
  if (ext === '.risum') return 'risum';
  if (ext === '.risup') return 'risup';
  return 'charx';
}
