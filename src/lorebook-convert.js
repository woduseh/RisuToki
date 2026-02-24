'use strict';

/**
 * Convert a risu-format lorebook entry to CCV3 format (for card.json)
 * @param {object} risuEntry - risu internal format entry
 * @param {number} index - entry index (used for id/extensions)
 * @returns {object} CCV3 format entry
 */
function risuToCCV3(risuEntry, index = 0) {
  const keys = risuEntry.key
    ? risuEntry.key.split(',').map(k => k.trim()).filter(Boolean)
    : [];
  const secondaryKeys = risuEntry.secondkey
    ? risuEntry.secondkey.split(',').map(k => k.trim()).filter(Boolean)
    : [];

  return {
    keys,
    content: risuEntry.content || '',
    extensions: {
      depth: risuEntry.depth ?? 0,
      selectiveLogic: risuEntry.selectiveLogic ?? 0,
      addMemo: true,
      excludeRecursion: false,
      displayIndex: index,
      probability: risuEntry.probability ?? 100,
      useProbability: risuEntry.useProbability ?? true,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      caseSensitive: null,
      matchWholeWords: null,
      useGroupScoring: null,
      automationId: '',
      role: null,
      vectorized: false
    },
    enabled: true,
    insertion_order: risuEntry.insertorder ?? 100,
    name: risuEntry.comment || '',
    priority: risuEntry.insertorder ?? 100,
    id: index,
    comment: risuEntry.comment || '',
    selective: risuEntry.selective ?? false,
    secondary_keys: secondaryKeys,
    constant: risuEntry.alwaysActive ?? false,
    position: risuEntry.position || 'before_char',
    ...(risuEntry.mode === 'folder' ? { mode: 'folder' } : {}),
    ...(risuEntry.folder ? { folder: risuEntry.folder } : {})
  };
}

/**
 * Convert a CCV3-format lorebook entry to risu format (for module.risum)
 * @param {object} ccv3Entry - CCV3 format entry
 * @returns {object} risu internal format entry
 */
function ccv3ToRisu(ccv3Entry) {
  const key = Array.isArray(ccv3Entry.keys)
    ? ccv3Entry.keys.join(', ')
    : (ccv3Entry.keys || '');
  const secondkey = Array.isArray(ccv3Entry.secondary_keys)
    ? ccv3Entry.secondary_keys.join(', ')
    : (ccv3Entry.secondary_keys || '');

  return {
    key,
    comment: ccv3Entry.comment || ccv3Entry.name || '',
    content: ccv3Entry.content || '',
    mode: ccv3Entry.mode || 'normal',
    insertorder: ccv3Entry.insertion_order ?? 100,
    alwaysActive: ccv3Entry.constant ?? false,
    secondkey,
    selective: ccv3Entry.selective ?? false,
    ...(ccv3Entry.folder ? { folder: ccv3Entry.folder } : {})
  };
}

/**
 * Convert array of risu entries to CCV3 entries
 */
function risuArrayToCCV3(risuEntries) {
  return risuEntries.map((entry, i) => risuToCCV3(entry, i));
}

/**
 * Convert array of CCV3 entries to risu entries
 */
function ccv3ArrayToRisu(ccv3Entries) {
  return ccv3Entries.map(ccv3ToRisu);
}

module.exports = { risuToCCV3, ccv3ToRisu, risuArrayToCCV3, ccv3ArrayToRisu };
