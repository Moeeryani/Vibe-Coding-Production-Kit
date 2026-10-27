import path from 'node:path';
import process from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { AGENT_CHOICES } from './adapters.mjs';
import { initProject } from './init.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { planConsumerAssetRetirement } from './consumer-asset-retirement-plan.mjs';
import { inspectSelectedProfilesV2 } from './selected-profile-v2.mjs';
import { planCapabilityApplication } from './capability-application-plan.mjs';
import { buildGateInvocation } from './ci-gate-invocation.mjs';
import { extractTaskSelectors } from './ci-provider-adapters.mjs';
import { inspectProjectCI } from './ci-inspection.mjs';
import { planLegacyCIWorkflowTransition } from './legacy-ci-transition-plan.mjs';
import { discoverProjectCapabilities } from './capability-discovery.mjs';
import { planSmartInit } from './adoption-plan.mjs';
import {assessStage13Preview} from './stage13-brownfield-preflight.mjs';
import { planGreenfieldRecovery } from './greenfield-recovery-plan.mjs';
import {planStage13Recovery} from './stage13-recovery-plan.mjs';
import {planStage13RetiredEvidence,
  recoverInterruptedStage13} from './stage13-recovery-apply.mjs';
import {inspectStage13BootstrapResidue} from './stage13-bootstrap-recovery.mjs';
import {planStage13RecoveryLock} from './stage13-recovery-lock.mjs';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {inspectStage13CommittedOrphanLock} from './stage13-committed-orphan-lock.mjs';
import {readProjectBytes} from './safe-read.mjs';
import { planManagedSchemaRecovery } from './managed-recovery-plan.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { inspectLifecycleLock } from './lock-inspect-v2.mjs';
import { planOrphanBootstrap } from './orphan-bootstrap-plan.mjs';
import { planCommittedJournalCleanup } from './committed-cleanup-plan.mjs';
import { planStaleJournalQuarantine } from './stale-journal-plan.mjs';
import { STACK_CHOICES } from './stacks.mjs';
import { doctorExitCode, formatDoctorReport, runDoctor } from './doctor.mjs';
import { previewWorkflowRoute } from './workflow-router.mjs';
import { createWorkflowSession, deserializeWorkflowSession, runWorkflowSession, serializeWorkflowSession, switchWorkflowMode } from './workflow-runner.mjs';
import { runGatePreview } from './gate-preview.mjs';
import { runMechanicalGate, mechanicalGateExitCode } from './gate-run.mjs';
import { readCommitAuthorIdentity, validateL3ReviewEvidence } from './l3-review-evidence.mjs';
import { createGitReviewSnapshot } from './git-review.mjs';
import { readProjectTaskPack } from './task-read.mjs';
import { createTaskPack } from './task.mjs';
import { CONTEXT_MODES, createContextPack, DEFAULT_CONTEXT_MAX_BYTES } from './context.mjs';
import { formatReadinessReport, readinessExitCode, READINESS_STAGES, runTaskReadiness } from './readiness.mjs';
import { formatVerificationReport, runVerification, verificationExitCode, DEFAULT_VERIFY_TIMEOUT_MS } from './verify.mjs';
import { applyUpdate, checkForUpdate, formatUpdatePlan, planUpdate, publicUpdateReport, rollbackProject } from './update.mjs';
import { ignorePath, trackPath } from './manage.mjs';
import { planManageOperation } from './manage-plan.mjs';
import { getCliVersion } from './version.mjs';
import { evaluatePromptScenario, evaluatePromptSuite, formatPromptEvalReport, listPromptEvalScenarios, promptEvalExitCode } from './prompt-eval.mjs';
import { architectureFitnessExitCode, formatArchitectureFitnessReport, runArchitectureFitness } from './architecture-fitness.mjs';
import { DEFAULT_RELEASE_POLICY, DEFAULT_RELEASE_TIMEOUT_MS, formatReleaseCheckReport, releaseCheckExitCode, runReleaseCheck } from './release-check.mjs';
import { computeCommunityPluginDigest, formatCommunityPluginReport, inspectCommunityPlugins } from './community-plugins.mjs';

const HELP = `Vibe Coding Production CLI

Usage:
  vibe-coding-production init [directory] [options]
  vcp init [directory] [options]
  vcp init [directory] --dry-run [--json]  (zero-write adoption plan)
  vibe-coding-production update [directory] [--check|--dry-run] [--to <version>] [--json]
  vcp update [directory] [--check|--dry-run] [--to <version>] [--json]
  vibe-coding-production rollback [directory] [--backup <id>] [--json]
  vcp rollback [directory] [--backup <id>] [--json]
  vibe-coding-production manage ignore <path> [--dir <directory>]
  vibe-coding-production manage track <path> [--dir <directory>]
  vcp manage ignore <path> [--dir <directory>] [--dry-run] [--json]
  vcp manage track <path> [--dir <directory>] [--dry-run] [--json]
  vibe-coding-production doctor [directory] [--json] [--strict]
  vcp doctor [directory] [--json] [--strict]
  vcp gate [task-slug] --base <ref> [--head <ref>] [--minimum-level L0|L1|L2|L3] [--run] [--review-evidence <path>] [--dir <directory>] [--json]  (evidence only; readiness bar follows the level: L0 none, L1 plan-stage, L2/L3 implement-stage; never CI PASS)
  vcp review-evidence <evidence-file> [--task <slug>] [--base <ref>] [--head <ref>] [--dir <directory>] [--json]  (validate L3 review-evidence bindings; valid bindings are NOT authorization — live L3 authorization is disabled)
  vcp gate-preview [task-slug] --base <ref> [--head <ref>] [--dir <directory>] [--minimum-level L0|L1|L2|L3] [--json]  (read-only; reports the level's readiness bar; NOT a passing CI gate)
  vcp ci-gate-plan [directory] --provider github|gitlab|circleci|azure|custom [--task <slug>] [--pr-body-file <path>] [--base-sha <sha>] [--head-sha <sha>] [--shallow] [--job-name <name>] [--json]  (read-only invocation contract + snippet; installs nothing, enforces nothing)
  vcp workflow-preview <task-slug> [--workflow-mode manual|assisted|auto] [--workflow-phase plan|implement|review|release] [--base <git-ref>] [--release-version <version>] [--json]  (read-only routing)
  vcp workflow <task-slug> [--workflow-mode manual|assisted|auto] [--workflow-phase plan|implement|review|release] [--base <git-ref>] [--release-version <version>] [--review-evidence <path>] [--session-file <path>] [--dir <directory>] [--json]  (execute workflow transitions; manual/assisted confirm each step, auto stops on blockers; mode is session-scoped only)
  vcp inspect [directory] [--json]  (read-only Stage12 classification)
  vcp asset-plan [directory] --asset-set <greenfield-safe-v1|brownfield-minimal-v1> [--json]  (read-only legacy inventory)
  vcp profiles-preview [directory] [--json]  (read-only selected schema-v2 profile checks)
  vcp capability-plan [directory] [--json]  (read-only detected/proposed capabilities)
  vcp ci-plan [directory] [--json]  (read-only legacy workflow transition proposal)
  vcp capabilities [directory] [--json]  (read-only detected capability evidence)
  vcp recovery-plan [directory] [--json]  (read-only; no repair or cleanup)
  vcp adoption-recover [directory] --yes --confirm-recovery <SHA256> --allow-forensic-archive  (Stage13 G-FENCE gated)
  vibe-coding-production task <slug> [--title <text>] [--dir <directory>]
  vcp task <slug> [--title <text>] [--dir <directory>]
  vibe-coding-production ready <task> [--stage <name>] [--dir <directory>] [--json] [--strict]
  vcp ready <task> [--stage <name>] [--dir <directory>] [--json] [--strict]
  vibe-coding-production verify <task> [--dir <directory>] [--run] [--only <key>] [--output <path>]
  vcp verify <task> [--dir <directory>] [--run] [--only <key>] [--output <path>]
  vibe-coding-production context <task> [--dir <directory>] [--mode <name>] [--include <path>] [--planned <path>] [--base <ref>] [--head <ref>] [--output <path>]
  vcp context <task> [--dir <directory>] [--mode <name>] [--include <path>] [--planned <path>] [--base <ref>] [--head <ref>] [--output <path>]
  vcp prompt-eval list [--json]
  vcp prompt-eval <scenario> [--dir <directory>] [--response <path>] [--json]
  vcp prompt-eval all [--dir <directory>] [--responses <directory>] [--json]
  vcp fitness [--dir <directory>] [--config <path>] [--json]
  vcp release-check <version> [--dir <directory>] [--policy <path>] [--run] [--output <path>] [--json]
  vcp plugins [--dir <directory>] [--digest <bundle>] [--json]

Options:
  --agent <name>     generic | codex | cursor | claude | copilot | all
  --stack <name>     auto | generic | javascript | typescript | python | go | react-native
  --yes, -y          Non-interactive mode (defaults: current dir, generic, GitHub files on)
  --force            Overwrite supporting outputs where allowed; NEVER override init/adoption files
  --github           Explicitly include optional GitHub PR/issue scaffolding in init
  --no-github        Explicitly exclude optional GitHub PR/issue scaffolding
  --dry-run          Preview without writing files; update computes the full migration plan
  --adopt            Explicit Stage13 existing-repository adoption intent (requires full safety gate)
  --confirm-adoption <SHA256>  Confirm exact current Stage13 adoption intent fingerprint
  --confirm-recovery <SHA256>  Confirm exactly current Stage13 v3 recovery journal
  --allow-forensic-archive  Explicitly allow retaining in-root Stage13 forensic evidence
  --check            Update: report available VCP version/profile lifecycle changes
  --offline          Update --check: do not query npm; compare only with the running CLI
  --to <version>     Update: require the target version bundled in the running CLI
  --backup <id>      Rollback: restore a specific VCP backup (default: latest)
  --help, -h         Show help
  --asset-set <id>   Asset-plan only: explicit safe target surface; never authorizes cleanup
  --json             Init dry-run/doctor/inspect/ready/update/rollback/etc: emit machine-readable JSON
  --strict           Doctor/ready: return non-zero when warnings exist
  --run              Verify/release-check: explicitly execute configured local mechanics
  --only <key>       Verify: run/preview one configured command key; repeatable
  --timeout-ms <n>   Verify/release-check: command timeout (verify default: ${DEFAULT_VERIFY_TIMEOUT_MS}; release default: ${DEFAULT_RELEASE_TIMEOUT_MS}; 0 disables)
  --title <text>     Task: human-readable task title
  --dir <directory>  Task/ready/context/verify/manage/prompt-eval/fitness/release-check/plugins: project directory (default: current directory)
  --stage <name>     Ready: plan | implement
  --mode <name>      Context: plan | implement | review | security | release
  --include <path>   Context: add an existing repository-local file; repeatable
  --planned <path>   Context implement mode: declare a repository-local path that does not exist yet; repeatable
  --base <ref>       Context review mode: explicit Git base ref for the merge-base comparison
  --head <ref>       Context review mode: Git head ref (default: HEAD; requires --base)
  --output <path>    Context/verify/release-check: write output inside the repository
  --max-bytes <n>    Context: maximum rendered bytes (default: ${DEFAULT_CONTEXT_MAX_BYTES}; 0 disables)
  --response <path>   Prompt eval: one behavior-record JSON inside the project
  --responses <dir>  Prompt eval all: directory containing <scenario-id>.json records
  --config <path>    Fitness: project-relative config (default: docs/architecture/FITNESS.json)
  --policy <path>    Release-check: repo-relative policy (default: ${DEFAULT_RELEASE_POLICY})
  --digest <path>    Plugins: compute canonical SHA-256 for one local declarative bundle
  --version, -v      Show version

Examples:
  npx vibe-coding-production init
  npx vibe-coding-production update . --check
  npx vibe-coding-production update . --dry-run
  npx vibe-coding-production update .
  npx vibe-coding-production rollback .
  npx vibe-coding-production manage ignore AGENTS.md
  npx vibe-coding-production doctor .
  npx vibe-coding-production inspect . --json
  npx vibe-coding-production task accept-invite --title "Accept invitation"
  npx vibe-coding-production ready accept-invite --stage plan
  npx vibe-coding-production context accept-invite --mode plan
  npx vibe-coding-production ready accept-invite --stage implement
  npx vibe-coding-production context accept-invite --mode implement --planned src/invitations/service.ts
  npx vibe-coding-production verify accept-invite
  npx vibe-coding-production context accept-invite --mode review --base main
  npx vibe-coding-production verify accept-invite --run --output .vcp/evidence/accept-invite.json
  npx vibe-coding-production prompt-eval list
  npx vibe-coding-production prompt-eval all --responses .vcp/prompt-eval --json
  npx vibe-coding-production release-check 0.9.3 --run --json
  npx vibe-coding-production fitness --dir . --json
  npx vibe-coding-production plugins --dir . --json
  npx vibe-coding-production plugins --dir . --digest community-plugins/example
`;

function readOptionValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${name} requires a value.`);
  return value;
}

function parseArgs(args) {
  const parsed = {
    command: null,
    targetDir: null,
    manageAction: null,
    managePath: null,
    agent: null,
    stack: null,
    yes: false,
    force: false,
    includeGitHub: true,
    githubIntent: null,
    dryRun: false,
    adopt: false,
    adoptionFingerprint: null,
    recoveryFingerprint: null,
    allowForensicArchive: false,
    help: false,
    version: false,
    json: false,
    strict: false,
    title: null,
    taskDir: null,
    contextMode: 'plan',
    contextIncludes: [],
    contextPlanned: [],
    contextBase: null,
    contextHead: null,
    contextOutput: null,
    contextMaxBytes: DEFAULT_CONTEXT_MAX_BYTES,
    readinessStage: 'plan',
    verifyRun: false,
    verifyOnly: [],
    verifyTimeoutMs: DEFAULT_VERIFY_TIMEOUT_MS,
    updateCheck: false,
    updateOffline: false,
    updateTo: null,
    rollbackBackup: null,
    promptEvalResponse: null,
    promptEvalResponses: null,
    fitnessConfig: null,
    releasePolicy: null,
    pluginDigestPath: null,
    targetAssetSet: null,
    workflowMode: null,
    workflowPhase: null,
    workflowReleaseVersion: null,
    gateMinimumLevel: null,
    workflowSessionFile: null,
    reviewEvidencePath: null,
    reviewTaskSlug: null,
    ciProvider: null,
    ciTasks: [],
    ciPrBodyFile: null,
    ciBaseSha: null,
    ciHeadSha: null,
    ciShallow: false,
    ciJobName: null
  };

  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--strict') parsed.strict = true;
    else if (arg === '--run') parsed.verifyRun = true;
    else if (arg === '--check') parsed.updateCheck = true;
    else if (arg === '--offline') parsed.updateOffline = true;
    else if (arg === '--version' || arg === '-v') parsed.version = true;
    else if (arg === '--yes' || arg === '-y') parsed.yes = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--no-github' || arg === '--github') {
      const intent=arg==='--github'?'explicit-on':'explicit-off';
      if(parsed.githubIntent && parsed.githubIntent!==intent)throw new Error('Conflicting GitHub flags.');
      parsed.githubIntent=intent;
      parsed.includeGitHub=intent==='explicit-on';
    }
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--adopt') parsed.adopt = true;
    else if (arg === '--allow-forensic-archive')
      parsed.allowForensicArchive = true;
    else if (arg === '--confirm-recovery') {
      parsed.recoveryFingerprint=readOptionValue(args,index,'--confirm-recovery');
      index+=1;
    }
    else if (arg.startsWith('--confirm-recovery='))
      parsed.recoveryFingerprint=arg.slice('--confirm-recovery='.length);
    else if (arg === '--confirm-adoption') {
      parsed.adoptionFingerprint=readOptionValue(args,index,'--confirm-adoption');
      index+=1;
    }
    else if (arg.startsWith('--confirm-adoption='))
      parsed.adoptionFingerprint=arg.slice('--confirm-adoption='.length);
    else if (arg === '--title') { parsed.title = readOptionValue(args, index, '--title'); index += 1; }
    else if (arg.startsWith('--title=')) parsed.title = arg.slice('--title='.length);
    else if (arg === '--dir') { parsed.taskDir = readOptionValue(args, index, '--dir'); index += 1; }
    else if (arg.startsWith('--dir=')) parsed.taskDir = arg.slice('--dir='.length);
    else if (arg === '--stage') { parsed.readinessStage = readOptionValue(args, index, '--stage').toLowerCase(); index += 1; }
    else if (arg.startsWith('--stage=')) parsed.readinessStage = arg.slice('--stage='.length).toLowerCase();
    else if (arg === '--only') { parsed.verifyOnly.push(readOptionValue(args, index, '--only')); index += 1; }
    else if (arg.startsWith('--only=')) parsed.verifyOnly.push(arg.slice('--only='.length));
    else if (arg === '--timeout-ms') { parsed.verifyTimeoutMs = Number(readOptionValue(args, index, '--timeout-ms')); index += 1; }
    else if (arg.startsWith('--timeout-ms=')) parsed.verifyTimeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--mode') { parsed.contextMode = readOptionValue(args, index, '--mode').toLowerCase(); index += 1; }
    else if (arg.startsWith('--mode=')) parsed.contextMode = arg.slice('--mode='.length).toLowerCase();
    else if (arg === '--include') { parsed.contextIncludes.push(readOptionValue(args, index, '--include')); index += 1; }
    else if (arg.startsWith('--include=')) parsed.contextIncludes.push(arg.slice('--include='.length));
    else if (arg === '--planned') { parsed.contextPlanned.push(readOptionValue(args, index, '--planned')); index += 1; }
    else if (arg.startsWith('--planned=')) parsed.contextPlanned.push(arg.slice('--planned='.length));
    else if (arg === '--base') { parsed.contextBase = readOptionValue(args, index, '--base'); index += 1; }
    else if (arg.startsWith('--base=')) parsed.contextBase = arg.slice('--base='.length);
    else if (arg === '--head') { parsed.contextHead = readOptionValue(args, index, '--head'); index += 1; }
    else if (arg.startsWith('--head=')) parsed.contextHead = arg.slice('--head='.length);
    else if (arg === '--output') { parsed.contextOutput = readOptionValue(args, index, '--output'); index += 1; }
    else if (arg.startsWith('--output=')) parsed.contextOutput = arg.slice('--output='.length);
    else if (arg === '--max-bytes') { parsed.contextMaxBytes = Number(readOptionValue(args, index, '--max-bytes')); index += 1; }
    else if (arg.startsWith('--max-bytes=')) parsed.contextMaxBytes = Number(arg.slice('--max-bytes='.length));
    else if (arg === '--stack') { parsed.stack = readOptionValue(args, index, '--stack').toLowerCase(); index += 1; }
    else if (arg.startsWith('--stack=')) parsed.stack = arg.slice('--stack='.length).toLowerCase();
    else if (arg === '--asset-set') { parsed.targetAssetSet = readOptionValue(args, index, '--asset-set'); index += 1; }
    else if (arg === '--workflow-mode') { parsed.workflowMode = readOptionValue(args,index,'--workflow-mode'); index += 1; }
    else if (arg.startsWith('--workflow-mode=')) parsed.workflowMode=arg.slice('--workflow-mode='.length);
    else if (arg === '--workflow-phase') { parsed.workflowPhase = readOptionValue(args,index,'--workflow-phase'); index += 1; }
    else if (arg.startsWith('--workflow-phase=')) parsed.workflowPhase=arg.slice('--workflow-phase='.length);
    else if (arg === '--release-version') { parsed.workflowReleaseVersion = readOptionValue(args,index,'--release-version'); index += 1; }
    else if (arg === '--minimum-level') { parsed.gateMinimumLevel = readOptionValue(args,index,'--minimum-level'); index += 1; }
    else if (arg.startsWith('--minimum-level=')) parsed.gateMinimumLevel = arg.slice('--minimum-level='.length);
    else if (arg === '--review-evidence') { parsed.reviewEvidencePath = readOptionValue(args, index, '--review-evidence'); index += 1; }
    else if (arg.startsWith('--review-evidence=')) parsed.reviewEvidencePath = arg.slice('--review-evidence='.length);
    else if (arg === '--task') { parsed.reviewTaskSlug = readOptionValue(args, index, '--task'); index += 1; }
    else if (arg.startsWith('--task=')) parsed.reviewTaskSlug = arg.slice('--task='.length);
    else if (arg === '--session-file') { parsed.workflowSessionFile = readOptionValue(args, index, '--session-file'); index += 1; }
    else if (arg.startsWith('--session-file=')) parsed.workflowSessionFile = arg.slice('--session-file='.length);
    else if (arg === '--provider') { parsed.ciProvider = readOptionValue(args,index,'--provider').toLowerCase(); index += 1; }
    else if (arg.startsWith('--provider=')) parsed.ciProvider = arg.slice('--provider='.length).toLowerCase();
    else if (arg === '--task') { parsed.ciTasks.push(readOptionValue(args,index,'--task')); index += 1; }
    else if (arg.startsWith('--task=')) parsed.ciTasks.push(arg.slice('--task='.length));
    else if (arg === '--pr-body-file') { parsed.ciPrBodyFile = readOptionValue(args,index,'--pr-body-file'); index += 1; }
    else if (arg.startsWith('--pr-body-file=')) parsed.ciPrBodyFile = arg.slice('--pr-body-file='.length);
    else if (arg === '--base-sha') { parsed.ciBaseSha = readOptionValue(args,index,'--base-sha'); index += 1; }
    else if (arg.startsWith('--base-sha=')) parsed.ciBaseSha = arg.slice('--base-sha='.length);
    else if (arg === '--head-sha') { parsed.ciHeadSha = readOptionValue(args,index,'--head-sha'); index += 1; }
    else if (arg.startsWith('--head-sha=')) parsed.ciHeadSha = arg.slice('--head-sha='.length);
    else if (arg === '--shallow') parsed.ciShallow = true;
    else if (arg === '--job-name') { parsed.ciJobName = readOptionValue(args,index,'--job-name'); index += 1; }
    else if (arg.startsWith('--job-name=')) parsed.ciJobName = arg.slice('--job-name='.length);
    else if (arg.startsWith('--release-version=')) parsed.workflowReleaseVersion=arg.slice('--release-version='.length);
    else if (arg.startsWith('--asset-set=')) parsed.targetAssetSet = arg.slice('--asset-set='.length);
    else if (arg === '--agent') { parsed.agent = readOptionValue(args, index, '--agent').toLowerCase(); index += 1; }
    else if (arg.startsWith('--agent=')) parsed.agent = arg.slice('--agent='.length).toLowerCase();
    else if (arg === '--to') { parsed.updateTo = readOptionValue(args, index, '--to'); index += 1; }
    else if (arg.startsWith('--to=')) parsed.updateTo = arg.slice('--to='.length);
    else if (arg === '--backup') { parsed.rollbackBackup = readOptionValue(args, index, '--backup'); index += 1; }
    else if (arg === '--response') { parsed.promptEvalResponse = readOptionValue(args, index, '--response'); index += 1; }
    else if (arg.startsWith('--response=')) parsed.promptEvalResponse = arg.slice('--response='.length);
    else if (arg === '--responses') { parsed.promptEvalResponses = readOptionValue(args, index, '--responses'); index += 1; }
    else if (arg.startsWith('--responses=')) parsed.promptEvalResponses = arg.slice('--responses='.length);
    else if (arg === '--config') { parsed.fitnessConfig = readOptionValue(args, index, '--config'); index += 1; }
    else if (arg.startsWith('--config=')) parsed.fitnessConfig = arg.slice('--config='.length);
    else if (arg === '--policy') { parsed.releasePolicy = readOptionValue(args, index, '--policy'); index += 1; }
    else if (arg.startsWith('--policy=')) parsed.releasePolicy = arg.slice('--policy='.length);
    else if (arg === '--digest') { parsed.pluginDigestPath = readOptionValue(args, index, '--digest'); index += 1; }
    else if (arg.startsWith('--digest=')) parsed.pluginDigestPath = arg.slice('--digest='.length);
    else if (arg.startsWith('--backup=')) parsed.rollbackBackup = arg.slice('--backup='.length);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  parsed.command = positional[0] ?? null;
  if (parsed.command === 'manage') {
    parsed.manageAction = positional[1] ?? null;
    parsed.managePath = positional[2] ?? null;
    if (positional.length > 3) throw new Error(`Unexpected argument: ${positional[3]}`);
  } else {
    parsed.targetDir = positional[1] ?? null;
    if (positional.length > 2) throw new Error(`Unexpected argument: ${positional[2]}`);
  }
  return parsed;
}

async function promptForOptions(parsed) {
  if (parsed.yes) return { targetDir: parsed.targetDir ?? '.', agent: parsed.agent ?? 'generic',
    stack: parsed.stack ?? 'auto', includeGitHub: parsed.includeGitHub,
    requestedAdapterIntent: parsed.agent,
    githubIntent: parsed.githubIntent??'unspecified',
    force: parsed.force, dryRun: parsed.dryRun };
  const rl = createInterface({ input, output });
  try {
    const targetAnswer = parsed.targetDir ?? await rl.question('Target directory [.]: ');
    const targetDir = targetAnswer.trim() || '.';
    let agent = parsed.agent;
    let requestedAdapterIntent=parsed.agent;
    if (!agent) {
      const answer = await rl.question('AI tool [generic/codex/cursor/claude/copilot/all] (generic): ');
      requestedAdapterIntent = answer.trim() ? answer.trim().toLowerCase() : null;
      agent = requestedAdapterIntent ?? 'generic';
    }
    let stack = parsed.stack;
    if (!stack) { const answer = await rl.question('Stack [auto/generic/javascript/typescript/python/go] (auto): '); stack = answer.trim().toLowerCase() || 'auto'; }
    let includeGitHub = parsed.includeGitHub;
    let githubIntent = parsed.githubIntent??'unspecified';
    if (parsed.githubIntent===null) {
      const answer = (await rl.question('Include GitHub PR/issue scaffolding (no VCP npm CI)? [Y/n]: ')).trim().toLowerCase();
      includeGitHub = !['n', 'no'].includes(answer);
      if(answer)githubIntent=includeGitHub?'explicit-on':'explicit-off';
    }
    return { targetDir, agent, stack, includeGitHub, requestedAdapterIntent,
      githubIntent, force: parsed.force, dryRun: parsed.dryRun };
  } finally { rl.close(); }
}

function validateAgent(agent) { if (!AGENT_CHOICES.includes(agent)) throw new Error(`Unknown agent "${agent}". Choose one of: ${AGENT_CHOICES.join(', ')}.`); }
function validateStack(stack) { if (!STACK_CHOICES.includes(stack)) throw new Error(`Unknown stack "${stack}". Choose one of: ${STACK_CHOICES.join(', ')}.`); }

function printInitResult(result) {
  if(result.applied && result.schemaVersion===2) {
    console.log('Installed Adaptive VCP schema-v2 greenfield: '+result.assetSet);
    console.log('Created project files: '+result.createdFiles);
    console.log('Versioned recovery backup: '+result.backupId);
    return;
  }
  const verb = result.dryRun ? 'Would install' : 'Installed';
  console.log(`\n${verb} Vibe Coding Production Kit ${result.version} in ${result.target}`);
  console.log(`Files/paths: ${result.files.length}`);
  console.log(result.note);
  console.log(`Stack profile: ${result.stack}`);
  if (!result.dryRun) {
    console.log(`Update state: ${result.manifestPath}`);
    console.log('\nNext:');
    console.log('  Ask your coding agent to inspect the repository and set up VCP from repository evidence.');
    console.log('  The agent should draft Source of Truth, run `vcp doctor .`, and ask only for unresolved human-intent decisions.');
    console.log('  Then state your feature intent normally and have the agent drive task → ready → context → verify → review.');
  }
}

function formatUpdateCheck(report) {
  const lines = [
    `Installed VCP: ${report.installedVersion}`,
    `Running CLI:  ${report.cliVersion}`,
    `Latest npm:   ${report.latestVersion ?? 'unavailable'}`
  ];
  if (report.registryError) lines.push(`Registry:     unavailable (${report.registryError})`);
  if (report.cliUpdateAvailable) lines.push(`Running CLI is older than npm latest; use the delegated npx command below.`);
  if(report.adaptiveWriterBlocked)lines.push('Managed schema-v2 write/update: BLOCKED until D-01/G-FENCE and recovery acceptance.');
  if (report.stackProfileChange) {
    lines.push(`Stack profile: ${report.stackProfileChange.from} -> ${report.stackProfileChange.to} — ${report.stackProfileChange.reason}`);
  }
  lines.push(report.updateAvailable ? 'Project update available.' : 'No newer project version detected.');
  if (report.targetCommand) lines.push(`Preview with: ${report.targetCommand}`);
  return lines.join('\n');
}

export async function runCli(args) {
  const parsed = parseArgs(args);
  if((parsed.adopt||parsed.adoptionFingerprint!==null)&&parsed.command!=='init')
    throw new Error('Stage13 --adopt / --confirm-adoption apply only to init.');
  if(parsed.adoptionFingerprint!==null&&
     !/^[a-f0-9]{64}$/.test(parsed.adoptionFingerprint))
    throw new Error('Stage13 --confirm-adoption requires SHA-256 hex.');
  if(parsed.adoptionFingerprint!==null&&!parsed.adopt)
    throw new Error('Stage13 --confirm-adoption also requires explicit --adopt.');
  if((parsed.recoveryFingerprint!==null||parsed.allowForensicArchive)&&
      parsed.command!=='adoption-recover')
    throw new Error('Stage13 recovery confirmation/archive flags apply only to adoption-recover.');
  if(parsed.recoveryFingerprint!==null&&
     !/^[a-f0-9]{64}$/.test(parsed.recoveryFingerprint))
    throw new Error('--confirm-recovery requires a 64-character SHA-256 digest.');

  if (parsed.version) { console.log(await getCliVersion()); return; }
  if (parsed.help || parsed.command === null) { console.log(HELP); return; }
  if (!['context','workflow-preview','gate-preview','gate','review-evidence','workflow'].includes(parsed.command) && (parsed.contextBase || parsed.contextHead)) {
    throw new Error('--base/--head are only supported by the context command in review mode.');
  }
  if (parsed.command !== 'prompt-eval' && (parsed.promptEvalResponse || parsed.promptEvalResponses)) {
    throw new Error('--response/--responses are only supported by the prompt-eval command.');
  }
  if (parsed.command !== 'fitness' && parsed.fitnessConfig) {
    throw new Error('--config is only supported by the fitness command.');
  }
  if (parsed.command !== 'release-check' && parsed.releasePolicy) {
    throw new Error('--policy is only supported by the release-check command.');
  }
  if (parsed.command !== 'plugins' && parsed.pluginDigestPath) {
    throw new Error('--digest is only supported by the plugins command.');
  }
  if (parsed.command !== 'asset-plan' && parsed.targetAssetSet!==null) {
    throw new Error('--asset-set is only supported by read-only asset-plan.');
  }
  if(!['workflow-preview','workflow'].includes(parsed.command) &&
    (parsed.workflowMode!==null || parsed.workflowPhase!==null || parsed.workflowReleaseVersion!==null)) {
    throw new Error('--workflow-mode/--workflow-phase/--release-version are only supported by workflow-preview and workflow.');
  }

  if(!['gate-preview','gate'].includes(parsed.command) && parsed.gateMinimumLevel!==null) {
    throw new Error('--minimum-level is only supported by gate-preview.');
  }

  if(!['gate','workflow'].includes(parsed.command) && parsed.reviewEvidencePath!==null) {
    throw new Error('--review-evidence is only supported by the gate and workflow commands.');
  }
  if(parsed.command!=='workflow' && parsed.workflowSessionFile!==null) {
    throw new Error('--session-file is only supported by the workflow command.');
  }
  if(parsed.command!=='review-evidence' && parsed.reviewTaskSlug!==null) {
    throw new Error('--task is only supported by the review-evidence command.');
  }

  if(parsed.command==='gate') {
    if(parsed.force||parsed.dryRun||parsed.adopt||parsed.updateCheck||
      parsed.yes||parsed.agent!==null||parsed.stack!==null||
      parsed.githubIntent!==null||parsed.updateOffline||parsed.updateTo!==null||
      parsed.rollbackBackup!==null||parsed.strict||parsed.targetAssetSet!==null||
      parsed.pluginDigestPath!==null||parsed.releasePolicy!==null||
      parsed.fitnessConfig!==null||parsed.promptEvalResponse!==null||
      parsed.promptEvalResponses!==null||parsed.contextIncludes.length||
      parsed.contextPlanned.length||parsed.contextOutput!==null||
      parsed.contextMode!=='plan'||parsed.verifyOnly.length||
      parsed.workflowMode!==null||parsed.workflowPhase!==null||
      parsed.workflowReleaseVersion!==null||parsed.readinessStage!=='plan'||
      parsed.title!==null) {
      throw new Error('gate accepts only read-only source controls plus explicit --run and --timeout-ms; no unrelated flags.');
    }
    let reviewEvidence=null;
    if(parsed.reviewEvidencePath!==null) {
      try { reviewEvidence=JSON.parse(await readFile(path.resolve(parsed.reviewEvidencePath),'utf8')); }
      catch { throw new Error('Review evidence file unreadable or not valid JSON: '+parsed.reviewEvidencePath); }
    }
    const report=await runMechanicalGate({targetDir:path.resolve(parsed.taskDir??'.'),
      task:parsed.targetDir??null,baseRef:parsed.contextBase,
      headRef:parsed.contextHead??'HEAD',minimumLevel:parsed.gateMinimumLevel,
      run:parsed.verifyRun,timeoutMs:parsed.verifyTimeoutMs,reviewEvidence});
    console.log(parsed.json?JSON.stringify(report,null,2):
      'VCP gate: '+report.status+'\n'+
      'Verification executed: '+(report.verificationExecuted===true)+'\n'+
      (report.reviewEvidenceValidation
        ? 'Review evidence: valid='+report.reviewEvidenceValidation.valid+', authorized=false (live L3 authorization is disabled).\n'
        : '')+
      'Blocking reasons: '+(report.blockingReasons.join(', ')||'none')+'\n'+
      'NOT MERGE/RELEASE AUTHORIZATION. NEVER A CI PASS.');
    process.exitCode=mechanicalGateExitCode(report);
    return;
  }
  if(parsed.command==='gate-preview') {
    if(parsed.force||parsed.verifyRun||parsed.dryRun||parsed.adopt||parsed.updateCheck||
      parsed.yes||parsed.agent!==null||parsed.stack!==null||parsed.githubIntent!==null||
      parsed.updateOffline||parsed.updateTo!==null||parsed.rollbackBackup!==null||
      parsed.strict||parsed.targetAssetSet!==null||parsed.pluginDigestPath!==null||
      parsed.releasePolicy!==null||parsed.fitnessConfig!==null||
      parsed.promptEvalResponse!==null||parsed.promptEvalResponses!==null||
      parsed.contextIncludes.length||parsed.contextPlanned.length||parsed.contextOutput!==null||
      parsed.contextMode!=='plan'||parsed.verifyOnly.length||
      parsed.workflowMode!==null||parsed.workflowPhase!==null||
      parsed.workflowReleaseVersion!==null||parsed.readinessStage!=='plan'||
      parsed.title!==null) {
      throw new Error('gate-preview is read-only; unsupported options or mutating flags present.');
    }
    const report=await runGatePreview({targetDir:path.resolve(parsed.taskDir??'.'),
      task:parsed.targetDir??null,baseRef:parsed.contextBase,
      headRef:parsed.contextHead??'HEAD',minimumLevel:parsed.gateMinimumLevel});
    console.log(parsed.json?JSON.stringify(report,null,2):
      'VCP gate preview: '+report.decision.status+'; level='+report.decision.level+'\n'+
      'Base: '+report.baseSha+'; head: '+report.headSha+'\n'+
      'Reasons: '+(report.decision.reasons.join(', ')||'none')+'\n'+
      'NO CHECKS EXECUTED. NOT A PASSING GATE. NO MERGE AUTHORITY.');
    // Never return an ordinary success code that a CI system could mistake for PASS.
    process.exitCode=report.decision.status==='BLOCKED'?1:2;
    return;
  }
  if(parsed.command==='review-evidence') {
    if(!parsed.targetDir || parsed.force||parsed.verifyRun||parsed.dryRun||
      parsed.adopt||parsed.updateCheck||parsed.yes||parsed.agent!==null||parsed.stack!==null||
      parsed.githubIntent!==null||parsed.updateOffline||parsed.updateTo!==null||
      parsed.rollbackBackup!==null||parsed.strict||parsed.targetAssetSet!==null||
      parsed.pluginDigestPath!==null||parsed.releasePolicy!==null||parsed.fitnessConfig!==null||
      parsed.promptEvalResponse!==null||parsed.promptEvalResponses!==null||parsed.verifyOnly.length||
      parsed.workflowMode!==null||parsed.workflowPhase!==null||parsed.workflowReleaseVersion!==null||
      parsed.gateMinimumLevel!==null||parsed.readinessStage!=='plan'||parsed.title!==null) {
      throw new Error('review-evidence takes an evidence file plus read-only --task/--base/--head/--dir controls.');
    }
    let evidence;
    try { evidence=JSON.parse(await readFile(path.resolve(parsed.targetDir),'utf8')); }
    catch { throw new Error('Review evidence file unreadable or not valid JSON: '+parsed.targetDir); }
    const root=path.resolve(parsed.taskDir??'.');
    let context={};
    let contextNote='structural validation only: no --task/--base supplied, bindings unverified';
    if(parsed.reviewTaskSlug!==null||parsed.contextBase!==null) {
      if(parsed.reviewTaskSlug===null||parsed.contextBase===null) {
        throw new Error('review-evidence binding checks require both --task and --base.');
      }
      const snapshot=await createGitReviewSnapshot({targetDir:root,baseRef:parsed.contextBase,headRef:parsed.contextHead??'HEAD'});
      const record=await readProjectTaskPack(root,`docs/tasks/${parsed.reviewTaskSlug}.md`);
      const changeAuthorIdentity=await readCommitAuthorIdentity({targetDir:root,sha:snapshot.headSha});
      context={taskSlug:parsed.reviewTaskSlug,taskSha256:record.sha256,baseSha:snapshot.baseSha,
        headSha:snapshot.headSha,changedFiles:snapshot.changedFiles.map((f)=>f.path),changeAuthorIdentity};
      contextNote='bindings checked against the live Git revision and Task Pack digest';
    }
    const result=validateL3ReviewEvidence(evidence,context);
    const report={kind:'l3-review-evidence-check',
      evidenceId:(evidence!==null&&typeof evidence==='object'&&!Array.isArray(evidence)&&typeof evidence.evidenceId==='string')?evidence.evidenceId:null,
      ...result,contextNote,authorizationDisabled:true,
      note:'Valid bindings are NOT authorization. Live L3 authorization is disabled: no trustworthy reviewer-identity/signature mechanism exists.'};
    console.log(parsed.json?JSON.stringify(report,null,2):
      'L3 review evidence: valid='+result.valid+', authorized=false\n'+
      'Reasons: '+(result.reasons.join(', ')||'none')+'\n'+
      'Context: '+contextNote+'\n'+
      'NOT AUTHORIZATION. LIVE L3 AUTHORIZATION IS DISABLED.');
    process.exitCode=result.valid?0:1;
    return;
  }
  if(parsed.command==='workflow-preview') {
    if(!parsed.targetDir || parsed.force || parsed.verifyRun || parsed.dryRun ||
      parsed.adopt || parsed.updateCheck || parsed.yes || parsed.agent!==null ||
      parsed.stack!==null || parsed.taskDir!==null || parsed.contextHead!==null ||
      parsed.contextIncludes.length || parsed.contextPlanned.length ||
      parsed.contextOutput!==null || parsed.contextMode!=='plan' || parsed.targetAssetSet!==null ||
      parsed.updateOffline || parsed.updateTo!==null || parsed.rollbackBackup!==null ||
      parsed.strict || parsed.githubIntent!==null || parsed.pluginDigestPath!==null ||
      parsed.releasePolicy!==null || parsed.fitnessConfig!==null ||
      parsed.promptEvalResponse!==null || parsed.promptEvalResponses!==null ||
      parsed.verifyOnly.length) {
      throw new Error('workflow-preview takes a task slug and strictly read-only routing options.');
    }
    const result=previewWorkflowRoute({task:parsed.targetDir,
      mode:parsed.workflowMode??'manual',phase:parsed.workflowPhase??'plan',
      reviewBase:parsed.contextBase,releaseVersion:parsed.workflowReleaseVersion});
    console.log(parsed.json ? JSON.stringify(result,null,2) :
      'VCP workflow preview: '+result.status+' ('+result.workflowMode.effectivePreviewMode+')\n'+
      (result.blockingReason?'Blocked: '+result.blockingReason+'\n':'')+
      result.steps.map(s=>'NEXT (not executed): '+s.command).join('\n')+
      '\nNo commands executed, no workflow mode persisted, no gates opened.');
    if(result.status==='BLOCKED')process.exitCode=1;
    return;
  }
  if(parsed.command==='workflow') {
    if(!parsed.targetDir || parsed.force||parsed.verifyRun||parsed.dryRun||
      parsed.adopt||parsed.updateCheck||parsed.yes||parsed.agent!==null||parsed.stack!==null||
      parsed.githubIntent!==null||parsed.updateOffline||parsed.updateTo!==null||
      parsed.rollbackBackup!==null||parsed.strict||parsed.targetAssetSet!==null||
      parsed.pluginDigestPath!==null||parsed.releasePolicy!==null||parsed.fitnessConfig!==null||
      parsed.promptEvalResponse!==null||parsed.promptEvalResponses!==null||parsed.verifyOnly.length||
      parsed.contextIncludes.length||parsed.contextPlanned.length||parsed.contextOutput!==null||
      parsed.contextMode!=='plan'||parsed.contextHead!==null||parsed.gateMinimumLevel!==null||
      parsed.readinessStage!=='plan'||parsed.title!==null) {
      throw new Error('workflow takes a task slug plus workflow controls only.');
    }
    const root=path.resolve(parsed.taskDir??'.');
    let reviewEvidence=null;
    if(parsed.reviewEvidencePath!==null) {
      try { reviewEvidence=JSON.parse(await readFile(path.resolve(parsed.reviewEvidencePath),'utf8')); }
      catch { throw new Error('Review evidence file unreadable or not valid JSON: '+parsed.reviewEvidencePath); }
    }
    const sessionFile=parsed.workflowSessionFile?path.resolve(parsed.workflowSessionFile):null;
    let session=null;
    if(sessionFile) {
      try {
        session=deserializeWorkflowSession(await readFile(sessionFile,'utf8'));
        if(session.task!==parsed.targetDir) throw new Error(`Session file is for task ${session.task}, not ${parsed.targetDir}.`);
      } catch (error) {
        if(error?.code==='ENOENT') session=null;
        else throw error;
      }
    }
    if(session===null) {
      session=createWorkflowSession({targetDir:root,task:parsed.targetDir,
        mode:parsed.workflowMode??'manual',
        phase:parsed.workflowPhase??'plan'});
    } else if(parsed.workflowMode!==null && parsed.workflowMode!==session.mode) {
      switchWorkflowMode(session,parsed.workflowMode,{reason:'cli --workflow-mode'});
    }
    const phases=parsed.workflowPhase!==null?[parsed.workflowPhase]:undefined;
    let decide=null;
    let rl=null;
    if(session.mode==='manual' || session.mode==='assisted') {
      rl=createInterface({input,output});
      const ask=(question)=>rl.question(question);
      decide=async (proposal) => {
        if(proposal.mode==='manual') {
          console.log('Available next steps:');
          for(const step of proposal.availableSteps) console.log(`  ${step.id} — ${step.title}`);
          const answer=(await ask('Authorize which step? Enter its id (Enter = stop): ')).trim();
          if(!answer) return {stop:true};
          return {stepId:answer,approved:true};
        }
        console.log('Recommendation: '+proposal.recommendation.title);
        console.log(proposal.explanation);
        const answer=(await ask('Approve this step? [y/N] ')).trim().toLowerCase();
        return {approved:answer==='y'||answer==='yes'};
      };
    }
    try {
      const result=await runWorkflowSession(session,{
        baseRef:parsed.contextBase,releaseVersion:parsed.workflowReleaseVersion,
        reviewEvidence,phases,decide,
        onProgress:parsed.json?null:({step,result:stepResult})=>{
          console.log(`  ${step.id}: ${stepResult.status}${stepResult.blocker?' ('+stepResult.blocker+')':''}`);
        },
      });
      if(sessionFile) {
        await mkdir(path.dirname(sessionFile),{recursive:true});
        await writeFile(sessionFile,serializeWorkflowSession(result),'utf8');
      }
      if(parsed.json) console.log(JSON.stringify(result,null,2));
      else {
        console.log('VCP workflow: '+result.status+' (mode '+result.mode+', session-scoped; mode is NOT persisted to the lifecycle manifest)');
        console.log('Completed steps: '+(result.completedSteps.map((s)=>s.id).join(', ')||'none'));
        console.log('Blockers: '+(result.blockers.join(', ')||'none'));
      }
      process.exitCode=result.status==='COMPLETED'?0:1;
    } finally {
      if(rl) await rl.close();
    }
    return;
  }


  if (parsed.command === 'release-check') {
    const version = parsed.targetDir;
    if (!version) throw new Error('Release-check requires a candidate version, for example: vcp release-check 0.9.3.');
    const report = await runReleaseCheck({
      targetDir: path.resolve(parsed.taskDir ?? '.'),
      version,
      policyPath: parsed.releasePolicy ?? DEFAULT_RELEASE_POLICY,
      run: parsed.verifyRun,
      output: parsed.contextOutput,
      force: parsed.force,
      timeoutMs: parsed.verifyTimeoutMs,
      quiet: parsed.json
    });
    console.log(parsed.json ? JSON.stringify(report, null, 2) : formatReleaseCheckReport(report));
    process.exitCode = releaseCheckExitCode(report);
    return;
  }

  if (parsed.command === 'update') {
    const target = path.resolve(parsed.targetDir ?? '.');
    if (parsed.updateCheck) {
      const report = await checkForUpdate({ targetDir: target, fetchLatest: !parsed.updateOffline });
      console.log(parsed.json ? JSON.stringify(report, null, 2) : formatUpdateCheck(report));
      return;
    }

    if (parsed.dryRun) {
      const plan = await planUpdate({ targetDir: target, targetVersion: parsed.updateTo });
      console.log(parsed.json ? JSON.stringify(publicUpdateReport(plan), null, 2) : formatUpdatePlan(plan));
      process.exitCode = plan.conflicts > 0 ? 1 : 0;
      return;
    }

    if (!parsed.updateOffline && !parsed.updateTo) {
      const status = await checkForUpdate({ targetDir: target, fetchLatest: true });
      if (status.cliUpdateAvailable) {
        const delegated = status.targetCommand || `npx --yes vibe-coding-production@${status.latestVersion} update . --dry-run`;
        throw new Error(`VCP ${status.latestVersion} is available but this process is running ${status.cliVersion}. Preview/apply with: ${delegated}`);
      }
    }

    const result = await applyUpdate({ targetDir: target, targetVersion: parsed.updateTo });
    console.log(parsed.json ? JSON.stringify(publicUpdateReport(result), null, 2) : formatUpdatePlan(result));
    if (!parsed.json) {
      if (result.blocked) console.log('\nUpdate blocked; no project files were changed.');
      else if (result.applied) console.log(`\nApplied VCP ${result.toVersion}. Backup: ${result.backupId}`);
      else console.log('\nAlready up to date.');
    }
    process.exitCode = result.blocked ? 1 : 0;
    return;
  }

  if (parsed.command === 'rollback') {
    const result = await rollbackProject({ targetDir: path.resolve(parsed.targetDir ?? '.'), backupId: parsed.rollbackBackup });
    console.log(parsed.json ? JSON.stringify(result, null, 2) : `Restored VCP backup ${result.backupId}. Project state returned to ${result.restoredVersion}.`);
    return;
  }

  if (parsed.command === 'manage') {
    if (!['ignore', 'track'].includes(parsed.manageAction)) throw new Error('Manage command requires `ignore` or `track`.');
    if (!parsed.managePath) throw new Error(`Manage ${parsed.manageAction} requires a repository-relative path.`);
    const target = path.resolve(parsed.taskDir ?? '.');
    if(parsed.force)throw new Error('Manage --force is unsupported; no override authority is implied.');
    const manageInspection=await inspectProject(target);
    if(parsed.dryRun||manageInspection.schemaVersion===2||
       manageInspection.classification!=='MANAGED'){
      const preview=await planManageOperation({
        targetDir:target,relativePath:parsed.managePath,action:parsed.manageAction
      });
      console.log(parsed.json?JSON.stringify(preview,null,2):
        'VCP manage preview: '+(preview.blocked?'BLOCKED':'READ_ONLY')+
        '\nAction: '+(preview.actions[0]?.action??'none')+
        '\nReason: '+(preview.reason??preview.actions[0]?.reason??'none')+
        '\nNo project files written.');
      if(preview.blocked||manageInspection.schemaVersion===2)process.exitCode=1;
      return;
    }
    const result = parsed.manageAction === 'ignore'
      ? await ignorePath({ targetDir: target, relativePath: parsed.managePath })
      : await trackPath({ targetDir: target, relativePath: parsed.managePath });
    console.log(parsed.json ? JSON.stringify(result, null, 2) : `${result.ignored ? 'Ignored' : 'Tracking'} ${result.path}${result.created ? ' (created from current template)' : ''}.`);
    return;
  }

  if (parsed.command === 'plugins') {
    if (parsed.targetDir) throw new Error('Plugins project root must be supplied with --dir, not as a positional argument.');
    const target = path.resolve(parsed.taskDir ?? '.');
    if (parsed.pluginDigestPath) {
      const result = await computeCommunityPluginDigest(target, parsed.pluginDigestPath);
      const report = { bundle: result.bundle, digest: result.digest, files: result.files.map((item) => item.relative) };
      console.log(parsed.json ? JSON.stringify(report, null, 2) : `${report.digest}  ${report.bundle}\nFiles: ${report.files.join(', ')}`);
      return;
    }
    const report = await inspectCommunityPlugins(target);
    console.log(parsed.json ? JSON.stringify(report, null, 2) : formatCommunityPluginReport(report));
    return;
  }

  if(parsed.command==='adoption-recover') {
    if(parsed.force||parsed.verifyRun||parsed.dryRun||parsed.updateCheck||
       parsed.adopt||parsed.adoptionFingerprint!==null||
       parsed.agent!==null||parsed.stack!==null||
       parsed.githubIntent!==null||parsed.strict||parsed.taskDir||
       parsed.rollbackBackup||parsed.updateTo||parsed.updateOffline||
       parsed.contextOutput||parsed.verifyOnly.length)
      throw new Error('Stage13 adoption-recover cannot combine unrelated lifecycle flags.');
    if(!parsed.yes||parsed.recoveryFingerprint===null||
       parsed.allowForensicArchive!==true)
      throw new Error('Stage13 adoption-recover requires --yes, --confirm-recovery and --allow-forensic-archive.');
    // The mutating command MUST check D-01 before even accessing project
    // state. The user can obtain the immutable journal SHA from the
    // separate read-only 'recovery-plan --json' command.
    assertManagedMigrationGate();
    const root=path.resolve(parsed.targetDir??'.');
    const planned=await planStage13Recovery(root);
    const lockPlan=await planStage13RecoveryLock(root);
    if(planned.classification==='BLOCKED'||
       !planned.transaction||
       planned.journalSha256!==parsed.recoveryFingerprint||
       !['FRESH_RECOVERY_LOCK_CANDIDATE',
         'STALE_LOCK_RETAIN_AND_TAKEOVER_CANDIDATE'].includes(
           lockPlan.classification))
      throw new Error('Stage13 recovery evidence or exact journal fingerprint changed; re-run recovery-plan.');
    const recoveryApproval={
      intent:'RECOVER_STAGE13_EXACT_TRANSACTION',root,
      explicitConsent:true,transactionId:planned.transaction.id,
      journalSha256:planned.journalSha256,
      lockSha256:lockPlan.lockSha256,
      allowInRootForensicArchive:true
    };
    const result=await recoverInterruptedStage13({
      targetDir:root,recoveryApproval
    });
    console.log(parsed.json?JSON.stringify(result,null,2):
      'Stage13 recovery: '+result.classification+
      '\nForensic evidence preserved. No unrelated user files deleted.');
    return;
  }

  if (parsed.command === 'recovery-plan') {
    if(parsed.force||parsed.verifyRun||parsed.dryRun||parsed.updateCheck||
      parsed.yes||parsed.agent!==null||parsed.stack!==null||
      parsed.githubIntent!==null||parsed.strict||parsed.taskDir||
      parsed.rollbackBackup||parsed.updateTo||parsed.updateOffline||
      parsed.contextOutput||parsed.verifyOnly.length) {
      throw new Error('Recovery-plan is a strictly read-only inspection; no action or write flags accepted.');
    }
    const root=path.resolve(parsed.targetDir??'.');
    const raw=await readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,optional:true,maxBytes:512*1024
    });
    let stage13=false;
    if(raw!==null) {
      try {stage13=JSON.parse(raw.toString('utf8'))?.formatVersion===3;}
      catch{ /* Existing recovery reader reports malformed state. */ }
    }
    if(stage13) {
      const report=await planStage13Recovery(root);
      const recoveryLock=await planStage13RecoveryLock(root);
      const combined={...report,recoveryLock};
      console.log(parsed.json?JSON.stringify(combined,null,2):
        'Stage13 adoption recovery: '+report.classification+
        '\\nReason: '+(report.reason??'Exact owned recovery state inspected')+
        '\\nRead-only. No files changed.');
      if(report.classification==='BLOCKED')process.exitCode=1;
      return;
    }
    // A successfully rolled-back Stage13 transaction retains its
    // transaction+lock forensic bundle under a reserved in-root name.
    // It must not be misclassified as an unmanaged greenfield crash or
    // turned into a request to remove somebody else's control directory.
    if(raw===null) {
      const residue=await inspectStage13BootstrapResidue(root);
      if(['ORPHAN_ADOPTION_LOCK_ONLY','PREJOURNAL_STAGING_PRESENT'].includes(
        residue.classification)) {
        console.log(parsed.json?JSON.stringify(residue,null,2):
          'Stage13 pre-journal bootstrap residue: '+residue.classification+
          '\nNo cleanup permitted. The original project remains read-only pending owner review.');
        process.exitCode=1;
        return;
      }
      const finalized=await inspectStage13CommittedOrphanLock(root);
      if(['COMMITTED_ORPHAN_LOCK_CANDIDATE',
        'LOCK_OWNER_MAY_BE_ALIVE','OTHER_HOST_OWNER_UNPROVEN'].includes(
        finalized.classification)) {
        console.log(parsed.json?JSON.stringify(finalized,null,2):
          'Stage13 committed state with remaining adoption lock: '+
          finalized.classification+'\nNo mutation authorized.');
        process.exitCode=finalized.classification===
          'COMMITTED_ORPHAN_LOCK_CANDIDATE'?0:1;
        return;
      }
      const retired=await planStage13RetiredEvidence(root);
      if(retired.classification==='ALREADY_ROLLED_BACK') {
        console.log(parsed.json?JSON.stringify(retired,null,2):
          'Stage13 adoption was previously rolled back. Forensic evidence retained. No files changed.');
        return;
      }
    }
    const state=await inspectManagedRecovery(root);
    const inspected=await inspectProject(root);
    const report=state.transaction?.formatVersion===2&&state.transaction.committed
      ? await planCommittedJournalCleanup(root)
      : !state.transaction&&inspected.classification==='MANAGED'
      ? {root,classification:'HEALTHY',reason:'NO_INTERRUPTED_TRANSACTION',
          readOnly:true,writeAuthorized:false,actions:[]}
      : state.transaction?.operation==='init'
      ? await planGreenfieldRecovery(root)
      : state.transaction?.operation==='update'&&state.transaction?.formatVersion===2
        ? await planManagedSchemaRecovery(root)
        : !state.transaction && !state.blocked
          ? await planOrphanBootstrap(root)
          : {...state,executionAuthorized:false};
    report.lockInspection=await inspectLifecycleLock(root);
    if(inspected.classification!=='NEW') {
      report.stagingInspection=await planStaleJournalQuarantine(root);
    }
    report.writeAuthorized=false;
    console.log(parsed.json?JSON.stringify(report,null,2)
      : 'VCP recovery preview: '+(report.classification??(report.blocked?'BLOCKED':'INSPECTED'))+
        '\nReason: '+(report.reason??'Transaction inspected')+
        '\nNo file restoration, deletion or cleanup authorized.');
    if(report.blocked||report.classification==='BLOCKED')process.exitCode=1;
    return;
  }

  if (parsed.command === 'ci-plan' || parsed.command === 'capabilities') {
    if (parsed.force || parsed.verifyRun || parsed.dryRun || parsed.updateCheck ||
        parsed.yes || parsed.agent !== null || parsed.stack !== null ||
        parsed.githubIntent !== null || parsed.strict || parsed.title ||
        parsed.taskDir || parsed.contextIncludes.length || parsed.contextPlanned.length ||
        parsed.contextBase || parsed.contextHead || parsed.contextOutput ||
        parsed.updateOffline || parsed.updateTo || parsed.rollbackBackup ||
        parsed.verifyOnly.length || parsed.promptEvalResponse || parsed.promptEvalResponses ||
        parsed.fitnessConfig || parsed.releasePolicy || parsed.pluginDigestPath) {
      throw new Error('This command is strictly read-only; action and write flags are not accepted.');
    }
    const report=parsed.command==='ci-plan'
      ? await planLegacyCIWorkflowTransition(parsed.targetDir??'.')
      : await discoverProjectCapabilities(parsed.targetDir??'.');
    console.log(parsed.json?JSON.stringify(report,null,2)
      : parsed.command==='ci-plan'
        ? 'Legacy CI transition: '+report.action+' ('+report.reason+')\nREAD ONLY. D-01/G-FENCE NO-GO.'
        : 'Detected capabilities (not applied): '+report.capabilities.map(c=>c.id).join(', '));
    if(report.blocked)process.exitCode=1;
    return;
  }

  if (parsed.command === 'asset-plan') {
    if (parsed.force || parsed.verifyRun || parsed.dryRun || parsed.updateCheck ||
      parsed.agent !== null || parsed.stack !== null || parsed.yes ||
      parsed.githubIntent !== null || parsed.strict || parsed.title ||
      parsed.taskDir || parsed.contextIncludes.length || parsed.contextPlanned.length ||
      parsed.contextBase || parsed.contextHead || parsed.contextOutput ||
      parsed.updateOffline || parsed.updateTo || parsed.rollbackBackup ||
      parsed.verifyOnly.length || parsed.promptEvalResponse || parsed.promptEvalResponses ||
      parsed.fitnessConfig || parsed.releasePolicy || parsed.pluginDigestPath ||
      parsed.targetAssetSet===null) {
      throw new Error('Asset-plan is a strictly read-only inventory and requires --asset-set; no other flags accepted.');
    }
    const report=await planConsumerAssetRetirement(parsed.targetDir??'.',{
      targetAssetSet:parsed.targetAssetSet
    });
    console.log(parsed.json ? JSON.stringify(report,null,2)
      : 'Legacy consumer asset plan: '+(report.blocked?'BLOCKED':'READ-ONLY')+
        '\\nSource: '+(report.sourceAssetSet??'unknown')+
        '; target: '+(report.targetAssetSet??parsed.targetAssetSet)+
        '\\nCandidate retirements: '+(report.summary?.candidates??0)+
        '; preservation: '+(report.summary?.preserved??0)+
        '; conflicts: '+(report.summary?.conflicts??0)+
        '\\nNO FILES WRITTEN. D-01/G-FENCE remains NO-GO.');
    if(report.blocked)process.exitCode=1;
    return;
  }

  if (parsed.command === 'profiles-preview' || parsed.command === 'capability-plan') {
    if (parsed.force || parsed.verifyRun || parsed.dryRun || parsed.updateCheck ||
        parsed.agent!==null || parsed.stack!==null || parsed.yes ||
        parsed.githubIntent!==null || parsed.strict || parsed.title ||
        parsed.taskDir || parsed.contextIncludes.length || parsed.contextPlanned.length ||
        parsed.contextBase || parsed.contextHead || parsed.contextOutput ||
        parsed.updateOffline || parsed.updateTo || parsed.rollbackBackup ||
        parsed.verifyOnly.length || parsed.promptEvalResponse || parsed.promptEvalResponses ||
        parsed.fitnessConfig || parsed.releasePolicy || parsed.pluginDigestPath ||
        parsed.targetAssetSet!==null) {
      throw new Error('Profiles preview and capability plan are read-only; no mutation or unrelated options allowed.');
    }
    const root=path.resolve(parsed.targetDir??'.');
    const selected=await inspectSelectedProfilesV2(root);
    let report;
    if (parsed.command==='profiles-preview') {
      report=selected;
    } else {
      const discovery=await discoverProjectCapabilities(root);
      // Provenance context only: read the installed manifest when it parses.
      // A missing, corrupt, unknown-schema, or capability-field-carrying
      // manifest yields NO manifest context (manifest=null), never a
      // fabricated one; doctor remains the tool that reports manifest damage.
      let manifest=null;
      try { manifest=JSON.parse(await readFile(path.join(root,'.vcp','manifest.json'),'utf8')); }
      catch { manifest=null; }
      try {
        report=planCapabilityApplication({discovery,selectedProfiles:selected,manifest});
      } catch (error) {
        // Only manifest-caused failures fall back to no manifest context;
        // any other plan failure propagates unchanged.
        if (error?.code==='E_APPLICATION_MANIFEST_INVALID' ||
            error?.code==='E_APPLICATION_UNAUTHORIZED_MANIFEST_FIELD') {
          report=planCapabilityApplication({discovery,selectedProfiles:selected});
        } else throw error;
      }
    }
    console.log(parsed.json ? JSON.stringify(report,null,2) :
      parsed.command+': '+(report.status??report.selection)+
      '\nRead only. No applied capabilities, command authority, lifecycle mutations or gate changes.');
    return;
  }

  if (parsed.command === 'ci-gate-plan') {
    if (parsed.force || parsed.verifyRun || parsed.dryRun || parsed.adopt || parsed.yes ||
        parsed.agent !== null || parsed.stack !== null || parsed.githubIntent !== null ||
        parsed.updateOffline || parsed.updateTo !== null || parsed.rollbackBackup !== null ||
        parsed.strict || parsed.targetAssetSet !== null || parsed.pluginDigestPath !== null ||
        parsed.releasePolicy !== null || parsed.fitnessConfig !== null ||
        parsed.promptEvalResponse !== null || parsed.promptEvalResponses !== null ||
        parsed.contextIncludes.length || parsed.contextPlanned.length || parsed.contextOutput !== null ||
        parsed.contextMode !== 'plan' || parsed.verifyOnly.length ||
        parsed.workflowMode !== null || parsed.workflowPhase !== null ||
        parsed.workflowReleaseVersion !== null || parsed.readinessStage !== 'plan' ||
        parsed.title !== null || parsed.taskDir !== null ||
        parsed.contextBase !== null || parsed.contextHead !== null || parsed.gateMinimumLevel !== null) {
      throw new Error('ci-gate-plan is read-only; unsupported options or mutating flags present. Use --base-sha/--head-sha for refs, not --base/--head.');
    }
    if (!parsed.ciProvider) throw new Error('ci-gate-plan requires --provider github|gitlab|circleci|azure|custom.');
    const root = path.resolve(parsed.targetDir ?? '.');
    let selectors;
    if (parsed.ciTasks.length) {
      selectors = parsed.ciTasks;
    } else if (parsed.ciProvider === 'github') {
      if (!parsed.ciPrBodyFile) throw new Error('ci-gate-plan for github requires --task or --pr-body-file (PR body text to extract the VCP-Task trailer from).');
      let prBody;
      try { prBody = await readFile(parsed.ciPrBodyFile, 'utf8'); }
      catch { throw new Error(`Cannot read PR body file: ${parsed.ciPrBodyFile}`); }
      selectors = extractTaskSelectors('github', { prBody }).selectors;
    } else {
      selectors = extractTaskSelectors(parsed.ciProvider, { env: process.env }).selectors;
    }
    const existingCI = await inspectProjectCI(root);
    const detectedMap = { 'github-actions': 'github', 'gitlab-ci': 'gitlab', circleci: 'circleci', 'azure-pipelines': 'azure' };
    const detectedAdapters = [...new Set(existingCI.providers.map((p) => detectedMap[p]).filter(Boolean))];
    const providerMismatch = existingCI.providerStatus === 'detected' && !detectedAdapters.includes(parsed.ciProvider)
      ? `Requested provider '${parsed.ciProvider}' differs from detected project CI (${detectedAdapters.join(', ') || 'none'}). The snippet is for the requested provider, not the detected one.`
      : null;
    const policy = {};
    if (parsed.ciJobName) policy.stableJobName = parsed.ciJobName;
    const contract = buildGateInvocation({
      provider: parsed.ciProvider, selectors,
      baseSha: parsed.ciBaseSha, headSha: parsed.ciHeadSha,
      isShallow: parsed.ciShallow, policy, existingCI,
    });
    const report = { ...contract, detectedCI: existingCI, providerMismatch };
    if (parsed.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`VCP CI gate plan: ${contract.mode}\nProvider: ${contract.provider}; job: ${contract.jobName}\nSelection: ${contract.selection.kind}${contract.selection.task ? ` (${contract.selection.task})` : ''}\n${contract.command ? `Command: ${contract.command.shell}\n` : ''}Blockers: ${(contract.blockers.join(', ') || 'none')}\nCheck outcome: ${contract.checkOutcome}\nEnforcement: provider-enforced=false; local evidence only. ${contract.enforcement.toEnforce}\n${providerMismatch ? `Warning: ${providerMismatch}\n` : ''}${contract.snippet ? `--- snippet (${contract.snippet.provider}; copy into your workflow; VCP installs nothing) ---\n${contract.snippet.text}` : contract.snippetNote}`);
    }
    return;
  }

  if (parsed.command === 'inspect') {
    if (parsed.force || parsed.verifyRun || parsed.dryRun || parsed.updateCheck ||
      parsed.agent !== null || parsed.stack !== null || parsed.yes ||
      parsed.githubIntent !== null || parsed.strict || parsed.title ||
      parsed.taskDir || parsed.contextIncludes.length || parsed.contextPlanned.length ||
      parsed.contextBase || parsed.contextHead || parsed.contextOutput ||
      parsed.updateOffline || parsed.updateTo || parsed.rollbackBackup ||
      parsed.verifyOnly.length || parsed.promptEvalResponse || parsed.promptEvalResponses ||
      parsed.fitnessConfig || parsed.releasePolicy || parsed.pluginDigestPath) {
      throw new Error('Inspect is always read-only and does not accept mutating/planning flags.');
    }
    const report = await inspectProject(parsed.targetDir ?? '.');
    console.log(parsed.json ? JSON.stringify(report, null, 2)
      : `VCP inspection: ${report.classification}${report.reason ? ' (' + report.reason + ')' : ''}\nSelected root: ${report.root}\nNo files written.`);
    if (report.classification === 'BLOCKED') process.exitCode = 1;
    return;
  }

  if (parsed.command === 'doctor') {
    const report = await runDoctor(path.resolve(parsed.targetDir ?? '.'));
    console.log(parsed.json ? JSON.stringify(report, null, 2) : formatDoctorReport(report));
    process.exitCode = doctorExitCode(report, parsed.strict);
    return;
  }

  if (parsed.command === 'task') {
    const slug = parsed.targetDir;
    if (!slug) throw new Error('Task command requires a slug, for example: vcp task accept-invite.');
    const result = await createTaskPack({ targetDir: path.resolve(parsed.taskDir ?? '.'), slug, title: parsed.title, force: parsed.force, dryRun: parsed.dryRun });
    const verb = result.dryRun ? 'Would create' : 'Created';
    console.log(`${verb} task pack: ${result.relative}`);
    console.log(`Verification commands discovered from AGENTS.md: ${result.commandCount}`);
    return;
  }

  if (parsed.command === 'ready') {
    const task = parsed.targetDir;
    if (!task) throw new Error('Ready command requires a task slug or task file path.');
    if (!READINESS_STAGES.includes(parsed.readinessStage)) throw new Error(`Unknown readiness stage "${parsed.readinessStage}". Choose one of: ${READINESS_STAGES.join(', ')}.`);
    const report = await runTaskReadiness({ targetDir: path.resolve(parsed.taskDir ?? '.'), task, stage: parsed.readinessStage });
    console.log(parsed.json ? JSON.stringify(report, null, 2) : formatReadinessReport(report));
    process.exitCode = readinessExitCode(report, parsed.strict);
    return;
  }

  if (parsed.command === 'verify') {
    const task = parsed.targetDir;
    if (!task) throw new Error('Verify command requires a task slug or task file path.');
    const report = await runVerification({ targetDir: path.resolve(parsed.taskDir ?? '.'), task, only: parsed.verifyOnly, run: parsed.verifyRun, output: parsed.contextOutput, force: parsed.force, timeoutMs: parsed.verifyTimeoutMs, quiet: parsed.json });
    console.log(parsed.json ? JSON.stringify(report, null, 2) : formatVerificationReport(report));
    process.exitCode = verificationExitCode(report);
    return;
  }

  if (parsed.command === 'prompt-eval') {
    const action = parsed.targetDir;
    if (!action) throw new Error('Prompt-eval requires `list`, `all`, or a canonical scenario id.');
    if (action === 'list') {
      if (parsed.promptEvalResponse || parsed.promptEvalResponses) throw new Error('prompt-eval list does not accept --response/--responses.');
      const listing = await listPromptEvalScenarios();
      if (parsed.json) console.log(JSON.stringify(listing, null, 2));
      else {
        console.log(`Prompt evaluation suite: ${listing.suiteId}`);
        for (const scenario of listing.scenarios) console.log(`- ${scenario.id} — ${scenario.prompt} — ${scenario.properties.join(', ')}`);
      }
      return;
    }

    const target = path.resolve(parsed.taskDir ?? '.');
    if (action === 'all') {
      if (parsed.promptEvalResponse) throw new Error('prompt-eval all accepts --responses, not --response.');
      const report = await evaluatePromptSuite({ targetDir: target, responsesDir: parsed.promptEvalResponses ?? '.vcp/prompt-eval' });
      console.log(parsed.json ? JSON.stringify(report, null, 2) : formatPromptEvalReport(report));
      process.exitCode = promptEvalExitCode(report);
      return;
    }

    if (parsed.promptEvalResponses) throw new Error('Single prompt-eval scenarios accept --response, not --responses.');
    const report = await evaluatePromptScenario({ targetDir: target, scenarioId: action, response: parsed.promptEvalResponse });
    console.log(parsed.json ? JSON.stringify(report, null, 2) : formatPromptEvalReport(report));
    process.exitCode = promptEvalExitCode(report);
    return;
  }

  if (parsed.command === 'fitness') {
    if (parsed.targetDir) throw new Error('Fitness project root must be supplied with --dir, not as a positional argument.');
    const target = path.resolve(parsed.taskDir ?? '.');
    const report = await runArchitectureFitness({
      targetDir: target,
      configPath: parsed.fitnessConfig ?? undefined
    });
    console.log(parsed.json ? JSON.stringify(report, null, 2) : formatArchitectureFitnessReport(report));
    process.exitCode = architectureFitnessExitCode(report);
    return;
  }

  if (parsed.command === 'context') {
    const task = parsed.targetDir;
    if (!task) throw new Error('Context command requires a task slug or task file path.');
    if (!CONTEXT_MODES.includes(parsed.contextMode)) throw new Error(`Unknown context mode "${parsed.contextMode}". Choose one of: ${CONTEXT_MODES.join(', ')}.`);
    const result = await createContextPack({
      targetDir: path.resolve(parsed.taskDir ?? '.'),
      task,
      mode: parsed.contextMode,
      includes: parsed.contextIncludes,
      planned: parsed.contextPlanned,
      gitBase: parsed.contextBase,
      gitHead: parsed.contextHead,
      output: parsed.contextOutput,
      maxBytes: parsed.contextMaxBytes,
      force: parsed.force,
      dryRun: parsed.dryRun
    });
    if (result.output) {
      const verb = result.dryRun ? 'Would write' : 'Wrote';
      console.log(`${verb} ${result.mode} context pack: ${result.output}`);
      console.log(`Context files: ${result.files.length}; planned paths: ${result.planned.length}; rendered bytes: ${result.bytes}`);
      if (result.gitReview) console.log(`Git review: ${result.gitReview.baseSha}...${result.gitReview.headSha}; changed files: ${result.gitReview.changedFiles.length}`);
    } else console.log(result.content);
    return;
  }

  if (parsed.command !== 'init') throw new Error(`Unknown command: ${parsed.command}\n\n${HELP}`);

  if (parsed.dryRun) {
    if (parsed.force) throw new Error('Init preview cannot authorize destructive --force.');
    const preview = await planSmartInit(path.resolve(parsed.targetDir ?? '.'), {
      agentPreference: parsed.agent,
      stackPreference: parsed.stack ?? 'auto',
      githubPreference: parsed.githubIntent==='explicit-on'?true:parsed.githubIntent==='explicit-off'?false:null
    });
    const consent=preview.classification==='EXISTING'?
      assessStage13Preview(preview):null;
    const report={...preview,
      ...(consent?{stage13Consent:{
        intentFingerprint:consent.intentFingerprint??null,
        expectedActions:consent.expectedActions??[],
        status:consent.reason??consent.classification,
        executionAuthorized:false
      }}:{})
    };
    console.log(parsed.json ? JSON.stringify(report, null, 2)
      : `VCP zero-write init plan: ${preview.classification} (${preview.assetSet ?? preview.reason})\nNew-file proposals: ${preview.planSummary?.claim ?? 0}; managed-section proposals: ${preview.planSummary?.section ?? 0}; preserved paths: ${preview.skippedPaths.length}; conflicts: ${preview.planSummary?.conflicts ?? 0}\nHuman decision: ${preview.humanDecisionRequired ? 'required' : 'not required'}${consent?.intentFingerprint?'\nStage13 consent fingerprint: '+consent.intentFingerprint:''}\nNo project files written.`);
    if (preview.blocked) process.exitCode = 1;
    return;
  }

  // Inspect first: existing, managed and blocked roots never request init
  // preferences and never proceed to first-install write planning.
  const target=path.resolve(parsed.targetDir??'.');
  const inspected=await inspectProject(target);
  if(['BLOCKED','MANAGED','EXISTING'].includes(inspected.classification)) {
    const preview=await planSmartInit(target,{
      agentPreference:parsed.agent,stackPreference:parsed.stack??'auto',
      githubPreference:parsed.githubIntent==='explicit-on'?true:
        parsed.githubIntent==='explicit-off'?false:null
    });
    if(inspected.classification==='EXISTING'&&parsed.adopt) {
      if(parsed.force)throw new Error('Stage13 adoption never uses --force.');
      if(!parsed.yes||!parsed.adoptionFingerprint)
        throw new Error('Explicit --adopt requires --yes and --confirm-adoption from the fresh dry-run plan.');
      const proposal=assessStage13Preview(preview);
      if(proposal.reason!=='EXPLICIT_ADOPTION_DECISION_REQUIRED'||
         proposal.intentFingerprint!==parsed.adoptionFingerprint)
        throw new Error('Stage13 adoption fingerprint changed or prerequisites are blocked; re-plan.');
      const adoptionApproval={
        intent:'ADOPT_EXISTING_REPOSITORY',root:target,explicitConsent:true,
        intentFingerprint:proposal.intentFingerprint,
        acceptedActions:proposal.expectedActions
      };
      const result=await initProject({
        targetDir:target,agent:parsed.agent??'generic',
        stack:parsed.stack??'auto',includeGitHub:parsed.includeGitHub,
        requestedAdapterIntent:parsed.agent,
        githubIntent:parsed.githubIntent??'unspecified',
        adoptionApproval
      });
      console.log(parsed.json?JSON.stringify(result,null,2):
        'Stage13 existing-repository adoption committed: '+result.assetSet+
        '\nCreated assets: '+result.createdFiles+'; backup: '+result.backupId);
      return;
    }
    if(parsed.adopt)
      throw new Error('Stage13 --adopt applies only to an EXISTING unmanaged repository.');
    if(parsed.json)console.log(JSON.stringify(preview,null,2));
    else console.log(inspected.classification==='MANAGED'
      ? 'Already managed; use vcp update --check or vcp doctor. No init files written.'
      : inspected.classification==='BLOCKED'
        ? 'Project state is blocked; use inspect and authorized recovery. No files written.'
        : 'Existing repository adoption apply belongs to Stage13. Use init --dry-run --json. No files written.');
    process.exitCode=1;
    return;
  }
  if(parsed.adopt||parsed.adoptionFingerprint!==null)
    throw new Error('Stage13 --adopt is valid only for an EXISTING unmanaged root.');
  if(parsed.json&&!parsed.yes) {
    throw new Error('Use --yes for non-interactive init --json, or --dry-run --json for a preview.');
  }
  const options = await promptForOptions(parsed);
  validateAgent(options.agent);
  validateStack(options.stack);
  if (options.force) throw new Error('Destructive vcp init --force is disabled; explicit Stage13 adoption apply is separate.');
  const result = await initProject({ targetDir: path.resolve(options.targetDir), agent: options.agent, stack: options.stack, includeGitHub: options.includeGitHub, requestedAdapterIntent: options.requestedAdapterIntent, githubIntent: options.githubIntent, force: false, dryRun: false });
  printInitResult(result);
}
