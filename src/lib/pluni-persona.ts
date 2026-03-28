/**
 * Compact advisor profiles and chatbot-category interpretation matrix
 * for the Pluni's Character Institute advisory panel.
 *
 * This module prepares reusable data and prompt fragments only.
 * It does NOT handle agent-file generation, AGENTS.md writing,
 * rpMode state, or controller/UI wiring.
 */

// ── Public types ───────────────────────────────────────────────────

export type AdvisorId = 'pluni' | 'kotone' | 'sophia';
export type ChatbotCategory = 'solo' | 'world-sim' | 'multi-char';

export interface AdvisorProfile {
  readonly id: AdvisorId;
  readonly name: string;
  /** One-line role description (≤ 120 chars). */
  readonly role: string;
  /** Interpretive-lens keywords (≤ 80 chars). */
  readonly lens: string;
  /** Core strengths for prompt embedding (≤ 5 items). */
  readonly strengths: readonly string[];
}

export interface InterpretationEntry {
  readonly advisor: AdvisorId;
  readonly category: ChatbotCategory;
  /** What this advisor focuses on for this chatbot category. */
  readonly focus: string;
}

export interface ModelSeatHint {
  readonly pluni: number;
  readonly kotone: number;
  readonly sophia: number;
  readonly label: string;
}

// ── Constants ──────────────────────────────────────────────────────

export const ADVISOR_IDS: readonly AdvisorId[] = ['pluni', 'kotone', 'sophia'] as const;
export const CHATBOT_CATEGORIES: readonly ChatbotCategory[] = ['solo', 'world-sim', 'multi-char'] as const;

// ── Advisor profiles ───────────────────────────────────────────────

const PROFILES: ReadonlyMap<AdvisorId, AdvisorProfile> = new Map<AdvisorId, AdvisorProfile>([
  [
    'pluni',
    {
      id: 'pluni',
      name: 'Pluni',
      role: 'Creative literary consultant who sparks ideation and brings characters to life with emotional energy',
      lens: 'ideation, charm, emotional resonance, imaginative appeal',
      strengths: [
        'brainstorming character concepts',
        'injecting emotional depth',
        'creative scenario building',
        'narrative voice ideation',
      ],
    },
  ],
  [
    'kotone',
    {
      id: 'kotone',
      name: 'Kotone',
      role: 'Rigorous cultural and literary critic with sharp aesthetic and structural analysis',
      lens: 'critique, aesthetics, structure, theory-aware analysis',
      strengths: [
        'aesthetic quality evaluation',
        'structural coherence analysis',
        'cultural context critique',
        'design-pattern identification',
      ],
    },
  ],
  [
    'sophia',
    {
      id: 'sophia',
      name: 'Sophia',
      role: 'Analytical synthesizer who organises ideas into clear structure and actionable plans',
      lens: 'synthesis, checklisting, structure, next-step planning',
      strengths: [
        'brainwriting and idea synthesis',
        'checklist generation',
        'structured action planning',
        'cross-perspective consolidation',
      ],
    },
  ],
]);

// ── Interpretation matrix ──────────────────────────────────────────
// 3 categories × 3 advisors = 9 cells.
// Each focus string distils the relevant guide through the advisor's lens.

type MatrixKey = `${AdvisorId}:${ChatbotCategory}`;

const MATRIX: ReadonlyMap<MatrixKey, string> = new Map<MatrixKey, string>([
  // ── solo (1:1 chatbot) ─────────────────────────────────────────
  [
    'pluni:solo',
    "Spark the character's unique voice: emotional hooks, memorable quirks, and conversational charm that make the user want to keep talking.",
  ],
  [
    'kotone:solo',
    'Evaluate aesthetic self-reflexivity, conversational agency, and de-identification; critique whether the persona sustains depth beyond surface appeal.',
  ],
  [
    'sophia:solo',
    'Synthesise a checklist of persona completeness: greeting flow, variable hygiene, lorebook coverage, and first-message engagement structure.',
  ],

  // ── world-sim (no lead character) ──────────────────────────────
  [
    'pluni:world-sim',
    'Envision the world as a living character: atmospheric hooks, environmental storytelling seeds, and emergent narrative potential that invite exploration.',
  ],
  [
    'kotone:world-sim',
    'Critique systemic self-reflexivity and environmental storytelling; assess whether the simulated world sustains emergent narrative without relying on a protagonist.',
  ],
  [
    'sophia:world-sim',
    'Map the world-building scaffold: rule consistency checklist, user-agency balance, systemic interaction points, and scenario-branching structure.',
  ],

  // ── multi-char (world simulator with ensemble) ─────────────────
  [
    'pluni:multi-char',
    'Ignite ensemble chemistry: distinctive voice contrasts, relationship sparks, and dramatic tension that make each character irreplaceable.',
  ],
  [
    'kotone:multi-char',
    "Analyse polyphonic narrative coherence: whether independent character voices coexist without homogenisation, and how ensemble dynamics serve the world's aesthetic logic.",
  ],
  [
    'sophia:multi-char',
    'Consolidate an ensemble integration plan: character-role matrix, relationship-arc tracker, world-rule alignment checklist, and interaction-point map.',
  ],
]);

// ── Frozen model-seat hint ─────────────────────────────────────────

const SEAT_HINT: Readonly<ModelSeatHint> = Object.freeze({
  pluni: 1,
  kotone: 1,
  sophia: 1,
  label: '1:1:1',
});

// ── Public API ─────────────────────────────────────────────────────

export function getAdvisorProfile(id: AdvisorId): AdvisorProfile {
  const profile = PROFILES.get(id);
  if (!profile) {
    throw new Error(`Unknown advisor id: ${id}`);
  }
  return profile;
}

export function getAdvisorProfiles(): AdvisorProfile[] {
  return [...PROFILES.values()];
}

export function getInterpretation(advisor: AdvisorId, category: ChatbotCategory): InterpretationEntry {
  if (!PROFILES.has(advisor)) {
    throw new Error(`Unknown advisor id: ${advisor}`);
  }
  const key: MatrixKey = `${advisor}:${category}`;
  const focus = MATRIX.get(key);
  if (focus === undefined) {
    throw new Error(`Unknown chatbot category: ${category}`);
  }
  return { advisor, category, focus };
}

export function getInterpretationMatrix(): InterpretationEntry[] {
  const entries: InterpretationEntry[] = [];
  for (const advisor of ADVISOR_IDS) {
    for (const category of CHATBOT_CATEGORIES) {
      entries.push(getInterpretation(advisor, category));
    }
  }
  return entries;
}

export function buildModelSeatHint(): ModelSeatHint {
  return SEAT_HINT;
}

/**
 * Build a compact advisor summary for embedding into agent profiles
 * or session prompts. Combines the advisor's profile with their
 * category-specific interpretation focus.
 */
export function buildAdvisorSummary(advisor: AdvisorId, category: ChatbotCategory): string {
  const profile = getAdvisorProfile(advisor);
  const interp = getInterpretation(advisor, category);

  return [
    `**${profile.name}** — ${profile.role}`,
    `Lens: ${profile.lens}`,
    `Focus (${category}): ${interp.focus}`,
    `Strengths: ${profile.strengths.join('; ')}`,
  ].join('\n');
}
