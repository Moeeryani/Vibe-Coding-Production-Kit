import { inspectProject } from './adoption-inspect.mjs';
import { resolveProjectPath } from './safe-path.mjs';

// Candidate Stage12 read-only planner. This is not an adoption executor:
// no files are created or claimed by this function; Stage13 owns first write.
const STACK_MARKERS = Object.freeze([
  ['javascript', 'package.json'],
  ['typescript', 'tsconfig.json'],
  ['python', 'pyproject.toml'],
  ['python', 'requirements.txt'],
  ['go', 'go.mod']
]);
const PREVIEW_PATHS = Object.freeze([
  'AGENTS.md',
  'docs/product/PRODUCT-BRIEF.md',
  'docs/product/PRD.md'
]);

async function existsRegular(root, relative) {
  try {
    await resolveProjectPath(root, relative, { purpose: 'read-existing' });
    return true;
  } catch (error) {
    if (error.code === 'E_VCP_PATH' && error.message.includes('MISSING_INPUT')) return false;
    throw error;
  }
}

export async function detectAdoptionStack(root) {
  const evidence = [];
  for (const [stack, relative] of STACK_MARKERS) {
    if (await existsRegular(root, relative)) evidence.push({ stack, path: relative });
  }
  const families = new Set(evidence.map(item => (
    item.stack === 'javascript' || item.stack === 'typescript' ? 'javascript' : item.stack
  )));
  if (families.size > 1) {
    return { stack: 'generic', evidence, polyglot: true, decisionRequired: true };
  }
  const stack = families.size === 0 ? 'generic'
    : families.has('javascript') ? (evidence.some(item => item.stack === 'typescript') ? 'typescript' : 'javascript')
    : [...families][0];
  return { stack, evidence, polyglot: false, decisionRequired: false };
}

export async function planSmartInit(targetDir) {
  const inspected = await inspectProject(targetDir);
  const base = {
    planVersion: 1, planKind: 'init', root: inspected.root,
    classification: inspected.classification, zeroWrite: true,
    actions: [], skippedPaths: [], humanDecisionRequired: false
  };
  if (inspected.classification === 'BLOCKED') {
    return { ...base, blocked: true, reason: inspected.reason, stack: 'generic',
      assetSet: null, stackEvidence: [] };
  }
  if (inspected.classification === 'MANAGED') {
    return { ...base, blocked: true, reason: 'ALREADY_MANAGED_USE_UPDATE',
      stack: 'generic', assetSet: inspected.assetSet, stackEvidence: [] };
  }
  try {
    const identified = await detectAdoptionStack(inspected.root);
    const assetSet = inspected.classification === 'NEW' ? 'greenfield-safe-v1' : 'brownfield-minimal-v1';
    const skippedPaths = [];
    const actions = [];
    for (const relative of PREVIEW_PATHS) {
      if (await existsRegular(inspected.root, relative)) {
        skippedPaths.push({ path: relative, reason: 'EXISTING_USER_CONTENT' });
      } else {
        actions.push({ action: 'CLAIM', path: relative, executionAuthorized: false });
      }
    }
    return {
      ...base, stack: identified.stack, assetSet,
      stackEvidence: identified.evidence, polyglot: identified.polyglot,
      humanDecisionRequired: identified.decisionRequired || inspected.classification === 'EXISTING',
      actions, skippedPaths, blocked: false
    };
  } catch {
    // Ambiguous/insecure detector paths must not be treated as absent.
    return { ...base, blocked: true, reason: 'UNSAFE_PROJECT_PATH', stack: 'generic',
      assetSet: null, stackEvidence: [] };
  }
}
