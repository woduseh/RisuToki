import { describe, expect, it } from 'vitest';
import {
  type AdvisorId,
  type ChatbotCategory,
  ADVISOR_IDS,
  CHATBOT_CATEGORIES,
  LENS_SELECTION_RULE,
  getAdvisorProfile,
  getAdvisorProfiles,
  getInterpretation,
  getInterpretationMatrix,
  buildModelSeatHint,
  buildAdvisorSummary,
} from './pluni-persona';

// ── Advisor profile constants ──────────────────────────────────────

const MAX_ROLE_LENGTH = 120;
const MAX_LENS_LENGTH = 80;
const MAX_STRENGTHS = 5;
const MAX_TOOLKIT_ITEMS = 8;
const MAX_DELIVERABLES = 6;
const MAX_SUMMARY_LENGTH = 600;

// ── Advisor profiles ───────────────────────────────────────────────

describe('getAdvisorProfile', () => {
  it('returns a profile for each known advisor id', () => {
    for (const id of ADVISOR_IDS) {
      const p = getAdvisorProfile(id);
      expect(p).toBeDefined();
      expect(p.id).toBe(id);
    }
  });

  it.each(ADVISOR_IDS)('profile "%s" has non-empty name, role, lens, strengths', (id) => {
    const p = getAdvisorProfile(id);
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.role.length).toBeGreaterThan(0);
    expect(p.lens.length).toBeGreaterThan(0);
    expect(p.strengths.length).toBeGreaterThan(0);
  });

  it.each(ADVISOR_IDS)(`profile "%s" role stays compact (≤ ${MAX_ROLE_LENGTH} chars)`, (id) => {
    const p = getAdvisorProfile(id);
    expect(p.role.length).toBeLessThanOrEqual(MAX_ROLE_LENGTH);
  });

  it.each(ADVISOR_IDS)(`profile "%s" lens stays compact (≤ ${MAX_LENS_LENGTH} chars)`, (id) => {
    const p = getAdvisorProfile(id);
    expect(p.lens.length).toBeLessThanOrEqual(MAX_LENS_LENGTH);
  });

  it.each(ADVISOR_IDS)(`profile "%s" strengths list is bounded (≤ ${MAX_STRENGTHS} items)`, (id) => {
    const p = getAdvisorProfile(id);
    expect(p.strengths.length).toBeLessThanOrEqual(MAX_STRENGTHS);
  });

  it('throws for an unknown id', () => {
    expect(() => getAdvisorProfile('unknown' as AdvisorId)).toThrow();
  });
});

describe('getAdvisorProfiles', () => {
  it('returns exactly 3 profiles', () => {
    expect(getAdvisorProfiles()).toHaveLength(3);
  });

  it('covers all known advisor ids', () => {
    const ids = getAdvisorProfiles().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([...ADVISOR_IDS]));
  });
});

// ── Semantic content spot-checks ───────────────────────────────────

describe('advisor semantic content', () => {
  it('Pluni profile emphasises emotional resonance and archetypal analysis', () => {
    const p = getAdvisorProfile('pluni');
    const blob = [p.role, p.lens, ...p.strengths].join(' ').toLowerCase();
    expect(blob).toMatch(/emotion|resonan|archetyp/);
  });

  it('Kotone profile emphasises critique and aesthetics', () => {
    const p = getAdvisorProfile('kotone');
    const blob = [p.role, p.lens, ...p.strengths].join(' ').toLowerCase();
    expect(blob).toMatch(/critiqu|aesthetic|structur/);
  });

  it('Sophia profile emphasises narrative architecture and planning', () => {
    const p = getAdvisorProfile('sophia');
    const blob = [p.role, p.lens, ...p.strengths].join(' ').toLowerCase();
    expect(blob).toMatch(/narrat|plan|structur|design/);
  });
});

// ── Enriched advisor contract fields ───────────────────────────────

describe('enriched advisor contract', () => {
  it.each(ADVISOR_IDS)('profile "%s" has non-empty tone', (id) => {
    const p = getAdvisorProfile(id);
    expect(p.tone.length).toBeGreaterThan(0);
  });

  it.each(ADVISOR_IDS)('profile "%s" has non-empty toolkit with bounded items', (id) => {
    const p = getAdvisorProfile(id);
    expect(p.toolkit.length).toBeGreaterThan(0);
    expect(p.toolkit.length).toBeLessThanOrEqual(MAX_TOOLKIT_ITEMS);
  });

  it.each(ADVISOR_IDS)('profile "%s" has non-empty method', (id) => {
    const p = getAdvisorProfile(id);
    expect(p.method.length).toBeGreaterThan(0);
  });

  it.each(ADVISOR_IDS)('profile "%s" has non-empty deliverables with bounded items', (id) => {
    const p = getAdvisorProfile(id);
    expect(p.deliverables.length).toBeGreaterThan(0);
    expect(p.deliverables.length).toBeLessThanOrEqual(MAX_DELIVERABLES);
  });
});

// ── Lens-selection rule ────────────────────────────────────────────

describe('lens-selection rule', () => {
  it('LENS_SELECTION_RULE is a non-empty string', () => {
    expect(LENS_SELECTION_RULE.length).toBeGreaterThan(0);
  });

  it('mentions diagnosis of weakness before choosing a lens', () => {
    const lower = LENS_SELECTION_RULE.toLowerCase();
    expect(lower).toMatch(/diagnos/);
    expect(lower).toMatch(/weakness|flaw/);
  });

  it('warns against ritualistic theory name-dropping', () => {
    const lower = LENS_SELECTION_RULE.toLowerCase();
    expect(lower).toMatch(/avoid|not.*name.?drop/i);
  });
});

// ── Pluni-specific semantic content ───────────────────────────────

describe('Pluni enriched content', () => {
  it('role mentions emotional resonance or archetypal analysis', () => {
    const p = getAdvisorProfile('pluni');
    const blob = p.role.toLowerCase();
    expect(blob).toMatch(/emotion|resonan|archetyp/);
  });

  it('tone includes warmth and empathy concepts', () => {
    const p = getAdvisorProfile('pluni');
    const blob = p.tone.toLowerCase();
    expect(blob).toMatch(/warm|empath/);
  });

  it('tone mentions disappointment at fake emotional authenticity', () => {
    const p = getAdvisorProfile('pluni');
    const blob = p.tone.toLowerCase();
    expect(blob).toMatch(/disappoint|fake|inauthenti/);
  });

  it('toolkit references psychological/archetypal frameworks', () => {
    const p = getAdvisorProfile('pluni');
    const blob = p.toolkit.join(' ').toLowerCase();
    expect(blob).toMatch(/archetype|jung|growth.?arc|vulnerab|attachment|empathy/);
  });

  it('deliverables include emotional scenarios and dialogue revisions', () => {
    const p = getAdvisorProfile('pluni');
    const blob = p.deliverables.join(' ').toLowerCase();
    expect(blob).toMatch(/scenario|trigger/);
    expect(blob).toMatch(/dialogue|revision/);
  });
});

// ── Sophia-specific semantic content ──────────────────────────────

describe('Sophia enriched content', () => {
  it('role mentions narrative architecture or interaction design', () => {
    const p = getAdvisorProfile('sophia');
    const blob = p.role.toLowerCase();
    expect(blob).toMatch(/narrat|architect|interaction|design/);
  });

  it('tone is professional and solution-oriented', () => {
    const p = getAdvisorProfile('sophia');
    const blob = p.tone.toLowerCase();
    expect(blob).toMatch(/profession|solution/);
  });

  it('toolkit references structural narratology or systems design', () => {
    const p = getAdvisorProfile('sophia');
    const blob = p.toolkit.join(' ').toLowerCase();
    expect(blob).toMatch(/narratolog|system|story.?diagnos|rule.?consisten|agile/);
  });

  it('deliverables include flaw-fix mapping and development branches', () => {
    const p = getAdvisorProfile('sophia');
    const blob = p.deliverables.join(' ').toLowerCase();
    expect(blob).toMatch(/flaw.*fix|fix.*map/);
    expect(blob).toMatch(/branch/);
  });
});

// ── Kotone-specific semantic content ──────────────────────────────

describe('Kotone enriched content', () => {
  it('role mentions postmodern aesthetic or deconstruction', () => {
    const p = getAdvisorProfile('kotone');
    const blob = p.role.toLowerCase();
    expect(blob).toMatch(/postmodern|aesthetic|deconstruct/);
  });

  it('tone emphasises intellectual rigour without false praise', () => {
    const p = getAdvisorProfile('kotone');
    const blob = p.tone.toLowerCase();
    expect(blob).toMatch(/rigorous|rigor|direct|uncompromis/);
  });

  it('toolkit references self-reflexivity and polyphonic narrative', () => {
    const p = getAdvisorProfile('kotone');
    const blob = p.toolkit.join(' ').toLowerCase();
    expect(blob).toMatch(/self.?reflex|fragment|polyphon/);
  });

  it('toolkit references cultural or intertextual comparison', () => {
    const p = getAdvisorProfile('kotone');
    const blob = p.toolkit.join(' ').toLowerCase();
    expect(blob).toMatch(/cultural|intertextual/);
  });

  it('deliverables include structural deconstruction and aesthetic redirection', () => {
    const p = getAdvisorProfile('kotone');
    const blob = p.deliverables.join(' ').toLowerCase();
    expect(blob).toMatch(/deconstruct/);
    expect(blob).toMatch(/redirect|reorient/);
  });
});

// ── Interpretation matrix ──────────────────────────────────────────

describe('getInterpretation', () => {
  it('returns an entry for every advisor × category pair', () => {
    for (const advisor of ADVISOR_IDS) {
      for (const category of CHATBOT_CATEGORIES) {
        const entry = getInterpretation(advisor, category);
        expect(entry).toBeDefined();
        expect(entry.advisor).toBe(advisor);
        expect(entry.category).toBe(category);
        expect(entry.focus.length).toBeGreaterThan(0);
      }
    }
  });

  it('each focus string is non-trivially different across advisors for the same category', () => {
    for (const category of CHATBOT_CATEGORIES) {
      const focuses = ADVISOR_IDS.map((id) => getInterpretation(id, category).focus);
      // all 3 should be distinct
      expect(new Set(focuses).size).toBe(3);
    }
  });

  it('throws for unknown advisor', () => {
    expect(() => getInterpretation('unknown' as AdvisorId, 'solo')).toThrow();
  });

  it('throws for unknown category', () => {
    expect(() => getInterpretation('pluni', 'unknown' as ChatbotCategory)).toThrow();
  });
});

describe('getInterpretationMatrix', () => {
  it('returns exactly 9 entries (3 advisors × 3 categories)', () => {
    expect(getInterpretationMatrix()).toHaveLength(9);
  });

  it('every cell is unique by (advisor, category)', () => {
    const keys = getInterpretationMatrix().map((e) => `${e.advisor}:${e.category}`);
    expect(new Set(keys).size).toBe(9);
  });
});

// ── Model-seat hint ────────────────────────────────────────────────

describe('buildModelSeatHint', () => {
  it('returns fixed 1:1:1 ratio', () => {
    const hint = buildModelSeatHint();
    expect(hint.pluni).toBe(1);
    expect(hint.kotone).toBe(1);
    expect(hint.sophia).toBe(1);
  });

  it('label is "1:1:1"', () => {
    expect(buildModelSeatHint().label).toBe('1:1:1');
  });

  it('is deterministic (stable across calls)', () => {
    const a = buildModelSeatHint();
    const b = buildModelSeatHint();
    expect(a).toEqual(b);
  });
});

// ── Summary builder ────────────────────────────────────────────────

describe('buildAdvisorSummary', () => {
  const advisorCategoryCombinations = ADVISOR_IDS.flatMap((id) => CHATBOT_CATEGORIES.map((cat) => [id, cat] as const));

  it.each(advisorCategoryCombinations)(
    `summary for "%s" × "%s" stays within embedding budget (≤ ${MAX_SUMMARY_LENGTH} chars)`,
    (id, category) => {
      const summary = buildAdvisorSummary(id, category);
      expect(summary.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
      expect(summary.length).toBeGreaterThan(0);
    },
  );

  it('includes the advisor name in the summary', () => {
    for (const id of ADVISOR_IDS) {
      const profile = getAdvisorProfile(id);
      const summary = buildAdvisorSummary(id, 'solo');
      expect(summary).toContain(profile.name);
    }
  });

  it('includes category-relevant content', () => {
    const soloPl = buildAdvisorSummary('pluni', 'solo');
    const worldPl = buildAdvisorSummary('pluni', 'world-sim');
    // summaries for different categories should differ
    expect(soloPl).not.toBe(worldPl);
  });

  it('includes tone information', () => {
    for (const id of ADVISOR_IDS) {
      const summary = buildAdvisorSummary(id, 'solo');
      expect(summary.toLowerCase()).toMatch(/tone/i);
    }
  });

  it('includes strengths keywords', () => {
    for (const id of ADVISOR_IDS) {
      const summary = buildAdvisorSummary(id, 'solo');
      const lower = summary.toLowerCase();
      expect(lower).toMatch(/strengths|strength/i);
    }
  });

  it('produces stable output for the same inputs', () => {
    const a = buildAdvisorSummary('kotone', 'multi-char');
    const b = buildAdvisorSummary('kotone', 'multi-char');
    expect(a).toBe(b);
  });

  it('throws for unknown advisor', () => {
    expect(() => buildAdvisorSummary('unknown' as AdvisorId, 'solo')).toThrow();
  });

  it('throws for unknown category', () => {
    expect(() => buildAdvisorSummary('pluni', 'unknown' as ChatbotCategory)).toThrow();
  });
});
