// Adaptive Phase 3 — deterministic, read-only CI presence inspection.
// A CI configuration is evidence of files, NOT proof of verification coverage,
// successful execution, required checks, or deployment policy.
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { readProjectBytes } from './safe-read.mjs';

const MAX_WORKFLOWS = 64;
const MAX_CONFIG_BYTES = 256 * 1024;
const EXACT_CONFIGS = Object.freeze([
  ['gitlab-ci', '.gitlab-ci.yml'],
  ['circleci', '.circleci/config.yml'],
  ['azure-pipelines', 'azure-pipelines.yml'],
  ['azure-pipelines', 'azure-pipelines.yaml'],
  ['custom-ci', 'Jenkinsfile'],
  ['custom-ci', '.travis.yml'],
  ['custom-ci', '.buildkite/pipeline.yml'],
]);
const GATE_MARKER = /(?:^|[\s'"`])(?:npx\s+(?:--yes\s+)?|npm\s+exec\s+(?:--\s+)?|\b)vcp\s+gate(?:\s|$)/m;
const missingPath = (e) => e?.code === 'ENOENT' ||
  (e?.code === 'E_VCP_PATH' && /(?:MISSING_INPUT|ROOT_MISSING)/.test(e.message));

async function directoryState(root, rel) {
  // Validate the selected root and all ancestors without following links.
  // This is a read-only snapshot, NOT an atomic filesystem snapshot.
  const absolute = path.resolve(root);
  for (let ancestor = absolute; ; ancestor = path.dirname(ancestor)) {
    let st;
    try { st = await lstat(ancestor); }
    catch (e) { if (e?.code === 'ENOENT') return 'absent'; throw e; }
    if (st.isSymbolicLink() || !st.isDirectory()) return 'unsafe';
    if (path.dirname(ancestor) === ancestor) break;
  }
  let current = absolute;
  for (const component of rel.split('/')) {
    current = path.join(current, component);
    let st;
    try { st = await lstat(current); }
    catch (e) { if (e?.code === 'ENOENT') return 'absent'; throw e; }
    if (st.isSymbolicLink() || !st.isDirectory()) return 'unsafe';
  }
  return 'directory';
}

function freezeResult(evidence, observations, issueCodes) {
  const providers = [...new Set(evidence.map((x) => x.provider))].sort();
  const uncertain = issueCodes.length > 0;
  const markerSeen = evidence.some((x) => x.vcpGateTextObserved === true);
  const providerStatus = uncertain ? 'unassessed' : providers.length ? 'detected' : 'not-detected';
  return Object.freeze({
    readOnly: true,
    providerStatus,
    provider: providerStatus === 'unassessed' ? 'unassessed' : providers.length > 1 ? 'multiple' : providers[0] ?? 'not-detected',
    providers: Object.freeze(providers),
    evidence: Object.freeze(evidence.map(Object.freeze)),
    gateIntegration: uncertain ? 'unknown' : markerSeen ? 'text-observed' : 'not-observed',
    verificationCoverage: 'unassessed',
    requiredChecks: 'unassessed',
    executionStatus: 'unassessed',
    issues: Object.freeze([...new Set(issueCodes)].sort()),
    observations: Object.freeze(observations),
    note: 'Configuration presence and text markers do not prove semantic CI coverage, execution, or required merge protection.'
  });
}

export async function inspectProjectCI(projectRoot) {
  const root = path.resolve(projectRoot);
  const evidence = [], observations = [], issues = [];
  const inspectFile = async (provider, relative) => {
    try {
      const bytes = await readProjectBytes(root, relative,
        { optional: true, maxBytes: MAX_CONFIG_BYTES });
      if (bytes === null) return;
      evidence.push({ provider, path: relative,
        vcpGateTextObserved: GATE_MARKER.test(bytes.toString('utf8')) });
    } catch (e) {
      if (missingPath(e)) return;
      issues.push('UNSAFE_OR_UNREADABLE_CI_CONFIG');
      observations.push({ path: relative, reason: e?.code ?? 'READ_FAILED' });
    }
  };
  for (const [provider, relative] of EXACT_CONFIGS) {
    await inspectFile(provider, relative);
  }
  const dir = '.github/workflows';
  let state;
  try { state = await directoryState(root, dir); }
  catch (e) { state = 'unsafe'; observations.push({ path: dir, reason: e?.code ?? 'READ_FAILED' }); }
  if (state === 'unsafe') {
    issues.push('UNSAFE_WORKFLOW_DIRECTORY');
    observations.push({ path: dir, reason: 'NOT_A_TRUSTED_DIRECTORY' });
  } else if (state === 'directory') {
    // The relative file read below revalidates path ancestry and the file
    // identity, including symlink refusal. Readdir does not authorize writes.
    try {
      const names = (await readdir(path.join(root, dir))).sort();
      if (names.length > MAX_WORKFLOWS) {
        issues.push('WORKFLOW_ENTRY_LIMIT');
      } else {
        for (const name of names) {
          if (!/^[a-zA-Z0-9_.-]+\.ya?ml$/i.test(name)) continue;
          await inspectFile('github-actions', `${dir}/${name}`);
        }
      }
    } catch (e) {
      issues.push('WORKFLOW_DIRECTORY_UNREADABLE');
      observations.push({ path: dir, reason: e?.code ?? 'READ_FAILED' });
    }
  }
  return freezeResult(evidence, observations, issues);
}
