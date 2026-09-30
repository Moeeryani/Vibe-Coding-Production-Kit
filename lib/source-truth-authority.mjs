export const SOURCE_TRUTH_AUTHORITY_STATES = ['DRAFT', 'ACCEPTED', 'SUPERSEDED', 'ARCHIVED'];

function documentPreamble(content) {
  const nextSection = content.search(/^##\s+/m);
  return nextSection === -1 ? content : content.slice(0, nextSection);
}

export function parseSourceTruthAuthority(content) {
  const matches = [...documentPreamble(content).matchAll(/^Authority:[ \t]*(\S.*?)[ \t]*$/gmi)];
  if (matches.length === 0) return { explicit: false, state: 'LEGACY', error: null };
  if (matches.length > 1) {
    return {
      explicit: true,
      state: null,
      error: `Multiple Authority markers found (${matches.length}). Keep exactly one explicit Source-of-Truth authority marker.`
    };
  }

  const raw = matches[0][1].trim();
  const state = raw.toUpperCase();
  if (!SOURCE_TRUTH_AUTHORITY_STATES.includes(state)) {
    return {
      explicit: true,
      state: null,
      error: `Unknown Source-of-Truth authority "${raw}". Choose one of: ${SOURCE_TRUTH_AUTHORITY_STATES.join(', ')}.`
    };
  }
  return { explicit: true, state, error: null };
}

export function authorityIssueForStage(authority, stage) {
  if (authority.error) return authority.error;
  if (!authority.explicit || authority.state === 'ACCEPTED') return null;
  if (authority.state === 'DRAFT') {
    return stage === 'plan'
      ? null
      : 'Source-of-Truth authority is DRAFT; implementation requires ACCEPTED authority or an unmarked legacy document.';
  }
  return `Source-of-Truth authority is ${authority.state}; historical material cannot govern current task execution.`;
}

export function authorityIssueForContext(authority, mode) {
  if (authority.error) return authority.error;
  if (!authority.explicit || authority.state === 'ACCEPTED') return null;
  if (authority.state === 'DRAFT' && mode === 'plan') return null;
  if (authority.state === 'DRAFT') {
    return 'Source-of-Truth authority is DRAFT; only plan context may use draft governing material.';
  }
  return `Source-of-Truth authority is ${authority.state}; historical material cannot be included as governing Source of Truth. Use --include only when historical inspection is deliberate.`;
}
