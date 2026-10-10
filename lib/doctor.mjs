import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { detectStack } from './stacks.mjs';
import { assessStackProfile } from './stack-provenance.mjs';
import { hashContent, readBaseline, readManifest, readTransaction } from './state.mjs';
import { compareVersions } from './migrations.mjs';
import { getCliVersion } from './version.mjs';
import { COMMAND_KEYS } from './verification-commands.mjs';
import { loadSecurityProfileContext } from './security-profiles.mjs';
import { loadCommunityPlugins } from './community-plugins.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { readAdaptiveManifest } from './manifest-v2.mjs';
import { inspectManagedOwnership } from './ownership-health.mjs';
import { inspectAdapterProvenance } from './adapter-provenance.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { inspectLifecycleLock } from './lock-inspect-v2.mjs';
import { readProjectCommandAuthority } from './command-authority.mjs';
import { resolvePackagedPrompt } from './prompt-resolver.mjs';

const CORE_DOCS = [
  ['product-brief', 'Product brief', 'docs/product/PRODUCT-BRIEF.md'],
  ['prd', 'Product requirements', 'docs/product/PRD.md'],
  ['architecture', 'Architecture', 'docs/architecture/ARCHITECTURE.md'],
  ['threat-model', 'Threat model', 'docs/security/THREAT-MODEL.md'],
  ['test-strategy', 'Test strategy', 'docs/testing/TEST-STRATEGY.md'],
  ['definition-ready', 'Definition of Ready', 'docs/delivery/DEFINITION-OF-READY.md'],
  ['definition-done', 'Definition of Done', 'docs/delivery/DEFINITION-OF-DONE.md']
];

const TEMPLATE_SIGNALS = {
  'product-brief': [
    'What painful, frequent, or valuable problem are we solving?',
    'Who experiences the problem? Segment primary vs secondary users.'
  ],
  prd: [
    'FR-001 — <Requirement name>',
    '- Owner:\n- Status: Draft / Review / Accepted / Superseded'
  ],
  architecture: ['List the qualities the architecture must optimize for', '| | | | |'],
  'threat-model': ['| T-001 | | | | | | | |'],
  'test-strategy': ['| | | | | |']
};

const UNASSESSED_DECISION_DOCS = [
  'docs/product/USER-FLOWS.md',
  'docs/architecture/DOMAIN.md',
  'docs/architecture/DATA-MODEL.md'
];

function coverageReport() {
  return {
    starterTemplateMarkerPaths: CORE_DOCS
      .filter(([id]) => (TEMPLATE_SIGNALS[id] ?? []).length > 0)
      .map(([, , relative]) => relative),
    presenceOnlyCorePaths: CORE_DOCS
      .filter(([id]) => (TEMPLATE_SIGNALS[id] ?? []).length === 0)
      .map(([, , relative]) => relative),
    unassessedDecisionPaths: [...UNASSESSED_DECISION_DOCS]
  };
}

async function fileExists(file) {
  try {await lstat(file);return true;}
  catch(error) {if(error.code==='ENOENT')return false;throw error;}
}

// Doctor is read-only; it must never traverse a user-authored linked
// project file, parent, junction or reparse point to report health.
async function readableNonEmpty(root,relative) {
  try {
    const file=await resolveProjectPath(root,relative,{purpose:'read-existing'});
    const metadata=await lstat(file);
    return metadata.isFile()&&!metadata.isSymbolicLink()&&metadata.size>0;
  }catch {return false;}
}
async function read(root,relative) {
  try {
    const bytes=await readProjectBytes(root,relative,{optional:true,maxBytes:4*1024*1024});
    return bytes?.toString('utf8')??'';
  }catch {return '';}
}

function check(status, id, title, detail, remediation = null) {
  return { status, id, title, detail, remediation };
}

function parseCommands(agents) {
  const result = {};
  for (const key of COMMAND_KEYS) {
    const match = agents.match(new RegExp(`^${key}=(.*)$`, 'm'));
    result[key] = match?.[1]?.trim() ?? null;
  }
  return result;
}

function unresolvedCommands(commands) {
  return Object.entries(commands)
    .filter(([, value]) => value === null || value === '' || /^<define(?: or n\/a)?>$/i.test(value))
    .map(([key]) => key);
}

function looksLikeTemplate(id, content) {
  return (TEMPLATE_SIGNALS[id] ?? []).some((signal) => content.includes(signal));
}

async function addUpdateStateChecks(target, checks, inspected) {
  const manifestPath = path.join(target, '.vcp/manifest.json');
  const manifestPresent = await fileExists(manifestPath);
  let manifest;

  try {
    if(inspected.classification==='BLOCKED')throw new Error('Unsafe VCP lifecycle: '+inspected.reason);
    manifest = inspected.classification==='MANAGED'&&inspected.schemaVersion===2
      ? await readAdaptiveManifest(target) : await readManifest(target);
    checks.push(check(
      'pass',
      'update-state',
      'VCP update state',
      `Manifest tracks VCP ${manifest.installedVersion} and ${Object.keys(manifest.managedFiles).length} managed file(s).`
    ));
  } catch (error) {
    checks.push(check(
      manifestPresent ? 'fail' : 'warn',
      'update-state',
      'VCP update state',
      error.message,
      manifestPresent
        ? 'Repair or restore `.vcp/manifest.json` from a known-good commit or VCP backup before updating.'
        : 'Initialize with VCP v0.9.0+ before relying on automatic updates.'
    ));
    return null;
  }

  const cliVersion = await getCliVersion();
  const versionOrder = compareVersions(manifest.installedVersion, cliVersion);
  if (versionOrder === 0) {
    checks.push(check(
      'pass',
      'vcp-version',
      'VCP version',
      `Project state and running CLI both use ${cliVersion}.`
    ));
  } else if (versionOrder < 0) {
    checks.push(check(
      'warn',
      'vcp-version',
      'VCP version',
      `Project is on ${manifest.installedVersion}; running CLI is ${cliVersion}.`,
      'Run `vcp update . --dry-run` before applying the update.'
    ));
  } else {
    checks.push(check(
      'warn',
      'vcp-version',
      'VCP version',
      `Project was managed by newer VCP ${manifest.installedVersion}; running CLI is ${cliVersion}.`,
      'Use an equal or newer VCP CLI; do not downgrade project state.'
    ));
  }

  const damaged = [];
  for (const [relative, entry] of Object.entries(manifest.managedFiles)) {
    try {
      const baseline=manifest.schemaVersion===2
        ? await readProjectBytes(target,entry.baselinePath,{managedState:true})
        : await readBaseline(target,entry);
      if (hashContent(baseline) !== entry.baselineHash) damaged.push(relative);
    } catch {
      damaged.push(relative);
    }
  }

  if (damaged.length === 0) {
    checks.push(check(
      'pass',
      'baseline-integrity',
      'Update baselines',
      'All tracked baseline snapshots pass integrity checks.'
    ));
  } else {
    checks.push(check(
      'fail',
      'baseline-integrity',
      'Update baselines',
      `${damaged.length} baseline snapshot(s) are missing or corrupted: ${damaged.slice(0, 5).join(', ')}${damaged.length > 5 ? '…' : ''}.`,
      'Restore `.vcp/baselines` from version control or the latest known-good VCP backup before updating.'
    ));
  }

  if(manifest.schemaVersion===2) {
    const recoveryState=await inspectManagedRecovery(target);
    if(recoveryState.blocked) {
      checks.push(check('fail','update-transaction','Versioned update transaction',
        'Versioned recovery state is unreadable: '+recoveryState.reason,
        'Use vcp recovery-plan; never use the legacy v0.9 rollback on schema-v2 state.'));
    }else if(recoveryState.transaction) {
      checks.push(check(recoveryState.transaction.committed?'warn':'fail',
        'update-transaction','Versioned update transaction',
        recoveryState.transaction.committed
          ? 'Committed journal awaits exact-identity cleanup; manifest hash was verified.'
          : 'Versioned '+recoveryState.transaction.operation+' transaction is incomplete.',
        'Use vcp recovery-plan and a separately approved versioned recovery process.'));
    }else {
      checks.push(check('pass','update-transaction','Versioned update transaction',
        'No interrupted versioned lifecycle transaction.'));
    }
  }else {
    let transaction;
    try {transaction=await readTransaction(target);}
    catch(error) {
      checks.push(check('fail','update-transaction','Update transaction',
        error.message,'Use vcp rollback only on a compatible legacy-v1 backup.'));
      return manifest;
    }
    if(transaction) {
      checks.push(check('fail','update-transaction','Update transaction',
        'Incomplete VCP update transaction '+transaction.id+' is in phase '+transaction.phase+'.',
        'Use compatible legacy-v1 rollback; do not run versioned recovery on v1.'));
    }else {
      checks.push(check('pass','update-transaction','Update transaction',
        'No interrupted VCP update transaction is present.'));
    }
  }

  return manifest;
}

// D-02 review candidate: surface governed outcomes independently from
// install-health without changing the legacy public CLI exit rule until
// its canonical maintainer decision is accepted.
const GOVERNANCE_CHECKS=new Set(['commands','security-profiles','community-plugins']);
const CORE_DOC_PATH_IDS=new Set(CORE_DOCS.map(([id])=>id));
function classifyDoctorChecks(checks,assetSet,inspection) {
  const installation=[],governance=[],summary={pass:0,warn:0,fail:0};
  for(const item of checks) {
    if(GOVERNANCE_CHECKS.has(item.id)) {
      governance.push(item);
      continue;
    }
    const skippedByAssetSet=assetSet==='brownfield-minimal-v1'&&
      CORE_DOC_PATH_IDS.has(item.id)&&
      item.status==='pass'&&item.detail.includes('not part of the required minimal');
    const noLegacyCi=(assetSet==='brownfield-minimal-v1'||assetSet==='greenfield-safe-v1')&&
      ['ci','validator'].includes(item.id)&&item.status==='pass';
    const lifecycleNotInstalled=inspection?.classification!=='MANAGED'&&
      inspection?.classification!=='BLOCKED'&&
      ['update-state','vcp-version','baseline-integrity','update-transaction'].includes(item.id);
    const applicable=!(skippedByAssetSet||noLegacyCi||lifecycleNotInstalled);
    installation.push({...item,applicable});
    if(applicable&&Object.hasOwn(summary,item.status))summary[item.status]++;
  }
  return {
    installHealth:{checks:installation,summary,readOnly:true},
    governance:{checks:governance,informational:true,
      note:'D-02 candidate separation; legacy public exit remains conservative until ratified'}
  };
}
export function proposedD02DoctorExitCode(report,strict=false) {
  const summary=report?.installHealth?.summary;
  if(!summary)throw new Error('D-02 install-health classification required');
  return summary.fail>0||(strict&&summary.warn>0)?1:0;
}

export async function runDoctor(targetDir) {
  const target = path.resolve(targetDir);
  const checks = [];
  const coverage = coverageReport();

  let targetIsDirectory = false;
  try {
    const rootState=await lstat(target);
    targetIsDirectory = rootState.isDirectory()&&!rootState.isSymbolicLink();
  } catch {
    targetIsDirectory = false;
  }

  if (!targetIsDirectory) {
    return {
      target,
      stack: 'unknown',
      lifecycleStack: null,
      securityProfiles: [],
      communityPlugins: [],
      coverage,
      checks: [check(
        'fail',
        'target',
        'Target directory',
        'Target directory does not exist.',
        'Pass an existing project directory.'
      )],
      summary: { pass: 0, warn: 0, fail: 1 }
    };
  }

  const stage12Inspection = await inspectProject(target);
  if(stage12Inspection.classification==='BLOCKED'&&
    ['ROOT_LINK_REFUSED','ROOT_NOT_DIRECTORY','ROOT_MISSING'].includes(stage12Inspection.reason)) {
    return {target,stack:'unknown',lifecycleStack:null,securityProfiles:[],
      communityPlugins:[],coverage,stage12Inspection,assetSet:null,
      checks:[check('fail','target','Selected root trust',
        'Refusing to traverse linked or invalid selected-root ancestry.')],
      summary:{pass:0,warn:0,fail:1}};
  }
  const assetSet = stage12Inspection.classification === 'BLOCKED' ? null
    : stage12Inspection.classification === 'MANAGED' ? (stage12Inspection.assetSet ?? 'legacy-full-v1')
    : stage12Inspection.classification === 'NEW' ? 'greenfield-safe-v1' : 'brownfield-minimal-v1';
  if (stage12Inspection.classification==='BLOCKED') {
    checks.push(check('fail','vcp-state','VCP state inspection',
      `Repository state is blocked: ${stage12Inspection.reason}.`,
      'Inspect the incompatible/corrupt lifecycle state and use authorized recovery, not init --force.'));
  }
  const recovery = await inspectManagedRecovery(target);
  const lockInspection = await inspectLifecycleLock(target);
  let commandGovernance;
  try {
    const authority = await readProjectCommandAuthority(target);
    commandGovernance = {
      policyVersion: authority.policyVersion,
      conflicts: authority.conflicts,
      duplicateEquivalent: authority.duplicateEquivalent,
      sensitiveKeys: authority.commands.filter(x=>x.effects.length).map(x=>x.key)
    };
  } catch (error) {
    commandGovernance = { unavailable: true, reason: error.code ?? 'E_COMMAND_INSPECTION' };
  }
  let stack='unknown',stackFailure=null;
  try {stack=await detectStack(target);}
  catch(error){stackFailure=error.code??'E_STACK_UNSAFE';}
  checks.push(check('pass', 'target', 'Target directory', 'Project directory is readable.'));
  checks.push(check(stackFailure?'fail':'pass',
    'stack','Stack detection',
    stackFailure
      ? 'Unsafe project stack marker: '+stackFailure+'. Refusing linked evidence.'
      : stack==='generic'
        ? 'No supported stack marker detected; generic rules apply.'
        : `Detected ${stack}.`
  ));

  const manifest = await addUpdateStateChecks(target, checks, stage12Inspection);
  const lifecycleStack = manifest ? assessStackProfile(stack, manifest.install) : null;
  const adapterProvenance=await inspectAdapterProvenance(target,manifest);
  let ownershipHealth=null;
  if(manifest) {
    ownershipHealth=await inspectManagedOwnership(target,manifest);
    if(ownershipHealth.status==='fail') {
      checks.push(check('fail','ownership-integrity','Managed section ownership',
        'Managed section markers or ownership metadata are invalid: '+ownershipHealth.reason,
        'Restore the known-good VCP section baseline and resolve orphan/duplicate markers explicitly.'));
    } else if(ownershipHealth.status==='pass') {
      checks.push(check('pass','ownership-integrity','Managed section ownership',
        ownershipHealth.sections+' managed section(s) have valid boundaries.'));
    }
  }

  const agentsPath = path.join(target, 'AGENTS.md');
  if (!(await readableNonEmpty(target,'AGENTS.md'))) {
    checks.push(check(
      'fail',
      'agents',
      'Agent instructions',
      'AGENTS.md is missing or empty.',
      'Run the initializer or add repository-wide agent rules.'
    ));
  } else {
    const agents = await read(target,'AGENTS.md');
    checks.push(check('pass', 'agents', 'Agent instructions', 'AGENTS.md is present.'));
    const unresolved = unresolvedCommands(parseCommands(agents));
    if (unresolved.length === 0) {
      checks.push(check(
        'pass',
        'commands',
        'Verification commands',
        'All command slots are explicitly defined or marked n/a.'
      ));
    } else {
      checks.push(check(
        'warn',
        'commands',
        'Verification commands',
        `${unresolved.length} command slot(s) still need a project-specific decision: ${unresolved.join(', ')}.`,
        'Define commands that apply to this repository; use n/a only when a check is intentionally not applicable.'
      ));
    }
  }

  let presentDocs = 0;
  let customizedDocs = 0;
  for (const [id, title, relative] of CORE_DOCS) {
    const file = path.join(target, relative);
    if (!(await readableNonEmpty(target,relative))) {
      if (assetSet==='brownfield-minimal-v1') {
        checks.push(check('pass',id,title,
          `${relative} is not part of the required minimal install surface; project docs remain user-owned.`));
        continue;
      }
      checks.push(check(
        'fail',
        id,
        title,
        `${relative} is missing or empty.`,
        `Create and complete ${relative}.`
      ));
      continue;
    }

    presentDocs += 1;
    const content = await read(target,relative);
    if (looksLikeTemplate(id, content)) {
      checks.push(check(
        'warn',
        id,
        title,
        `${relative} still contains starter-template signals.`,
        'Replace template prompts/placeholders with project-specific decisions.'
      ));
    } else {
      customizedDocs += 1;
      checks.push(check(
        'pass',
        id,
        title,
        `${relative} is present and no known starter-template marker was found.`
      ));
    }
  }

  let securityProfiles = [];
  try {
    const securityProfileContext = await loadSecurityProfileContext(target);
    securityProfiles = securityProfileContext.active;
    checks.push(check(
      'pass',
      'security-profiles',
      'Security profiles',
      `Active security profiles: ${securityProfiles.join(', ')}.${securityProfileContext.config ? '' : ' No project declaration found; packaged baseline fallback applies.'}`
    ));
  } catch (error) {
    checks.push(check(
      'fail',
      'security-profiles',
      'Security profiles',
      error.message,
      'Fix docs/security/SECURITY-PROFILE.md and selected profile documents before relying on security review context.'
    ));
  }

  let communityPlugins = [];
  try {
    const communityPluginState = await loadCommunityPlugins(target);
    communityPlugins = communityPluginState.plugins.map((plugin) => plugin.id);
    checks.push(check(
      'pass',
      'community-plugins',
      'Community plugins',
      communityPlugins.length
        ? `Selected community plugins are valid and pinned: ${communityPlugins.join(', ')}.`
        : 'No community plugins are explicitly selected; plugin trust remains opt-in.'
    ));
  } catch (error) {
    checks.push(check(
      'fail',
      'community-plugins',
      'Community plugins',
      error.message,
      'Fix docs/plugins/PLUGINS.json and the selected local plugin bundles before relying on community profile guidance.'
    ));
  }

  const workflow = path.join(target, '.github/workflows/validate.yml');
  if (assetSet==='greenfield-safe-v1'||assetSet==='brownfield-minimal-v1') {
    checks.push(check('pass','ci','CI validation',
      'Legacy VCP npm workflow is not required for this safe asset surface; provider CI coverage remains unassessed.'));
  } else {
    checks.push(
      await readableNonEmpty(target,'.github/workflows/validate.yml')
        ? check('pass', 'ci', 'CI validation', '.github/workflows/validate.yml is present.')
        : check('warn','ci','CI validation','Framework validation workflow is not installed.',
            'Add equivalent CI gates in your provider, or install the GitHub workflow.')
    );
  }

  const validator = path.join(target, 'scripts/validate-framework.sh');
  checks.push(
    (assetSet==='greenfield-safe-v1'||assetSet==='brownfield-minimal-v1')
      ? check('pass','validator','Local validation','Legacy framework-specific local validator is not required for this asset surface.')
      : await readableNonEmpty(target,'scripts/validate-framework.sh')
        ? check('pass', 'validator', 'Local validation', 'scripts/validate-framework.sh is available for local checks.')
        : check('warn','validator','Local validation','Local framework validation script is missing.',
            'Restore scripts/validate-framework.sh or provide an equivalent command.')
  );

  try {
    const planner=await resolvePackagedPrompt({projectRoot:target,relative:'prompts/02-plan-task.md',assetSet});
    const reviewer=await resolvePackagedPrompt({projectRoot:target,relative:'prompts/04-code-review.md',assetSet});
    checks.push(check('pass','agent-loop','Plan/review loop',
      `Prompt sources: plan=${planner.source}, review=${reviewer.source}.`));
  } catch {
    checks.push(check('warn','agent-loop','Plan/review loop',
      'A required prompt is neither a safe project override nor a packaged fallback.',
      'Restore the project override or use a compatible VCP package.'));
  }

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const item of checks) summary[item.status] += 1;

  return {
    target,
    stack,
    lifecycleStack,
    securityProfiles,
    communityPlugins,
    coverage,
    stage12Inspection,
    assetSet,
    recovery,
    lockInspection,
    commandGovernance,
    ownershipHealth,
    adapterProvenance,
    documents: {
      present: presentDocs,
      total: CORE_DOCS.length,
      customized: customizedDocs
    },
    checks,
    summary,
    ...classifyDoctorChecks(checks,assetSet,stage12Inspection)
  };
}

export function doctorExitCode(report, strict = false) {
  if (report.summary.fail > 0) return 1;
  if (strict && report.summary.warn > 0) return 1;
  return 0;
}

export function formatDoctorReport(report) {
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
  const lines = [
    'Vibe Coding Production Doctor',
    `Target: ${report.target}`,
    `Detected stack: ${report.stack}`
  ];

  if (report.lifecycleStack) {
    const requested = report.lifecycleStack.requestedStack ?? 'unknown (legacy provenance not recorded)';
    lines.push(`Installed profile: ${report.lifecycleStack.installedStack ?? 'unknown'}`);
    lines.push(`Requested stack: ${requested}`);
    lines.push(
      report.lifecycleStack.reprofileEligible
        ? `Re-profile: eligible -> ${report.lifecycleStack.reprofileTarget} — ${report.lifecycleStack.reason}`
        : `Re-profile: ${report.lifecycleStack.reprofileState} — ${report.lifecycleStack.reason}`
    );
    if (report.lifecycleStack.specializationState !== 'not-applicable') {
      lines.push(
        report.lifecycleStack.specializationEligible
          ? `React Native specialization: eligible -> ${report.lifecycleStack.specializationTarget} — ${report.lifecycleStack.specializationReason}`
          : `React Native specialization: ${report.lifecycleStack.specializationState} — ${report.lifecycleStack.specializationReason}`
      );
    }
  }

  if (report.stage12Inspection) {
    lines.push(`Stage12 inspection: ${report.stage12Inspection.classification}${report.stage12Inspection.reason ? ' (' + report.stage12Inspection.reason + ')' : ''}; surface: ${report.assetSet}`);
  }
  if(report.adapterProvenance?.schemaVersion===2) {
    lines.push('Adapter intent: '+(report.adapterProvenance.requestedAdapterIntent??'unspecified')+
      '; VCP-owned adapters: '+report.adapterProvenance.managedAdapterSurface.length+
      '; observed files are not presumed managed.');
  }
  if (report.commandGovernance) {
    lines.push(`Command governance: ${report.commandGovernance.conflicts?.length ?? 0} conflicts; ${report.commandGovernance.sensitiveKeys?.length ?? 0} sensitive keys (not install-health).`);
  }
  lines.push('');

  for (const item of report.checks) {
    lines.push(`[${icon[item.status]}] ${item.title}: ${item.detail}`);
    if (item.remediation && item.status !== 'pass') lines.push(`       Fix: ${item.remediation}`);
  }

  lines.push('');
  lines.push(`Summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`);
  if (report.documents) {
    lines.push(`Core docs: ${report.documents.present}/${report.documents.total} present; ${report.documents.customized} without known starter-template markers.`);
  }
  if (report.coverage) {
    lines.push(
      `Coverage: starter-template markers are checked for ${report.coverage.starterTemplateMarkerPaths.length}/${CORE_DOCS.length} core docs; `
      + `${report.coverage.presenceOnlyCorePaths.length} core docs are presence-only. `
      + `Not assessed for template completeness: ${report.coverage.unassessedDecisionPaths.join(', ')}.`
    );
  }
  return lines.join('\n');
}
