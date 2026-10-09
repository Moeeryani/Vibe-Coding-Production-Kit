import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { AGENT_CHOICES } from './adapters.mjs';
import { initProject } from './init.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { planSmartInit } from './adoption-plan.mjs';
import { planGreenfieldRecovery } from './greenfield-recovery-plan.mjs';
import { planManagedSchemaRecovery } from './managed-recovery-plan.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { STACK_CHOICES } from './stacks.mjs';
import { doctorExitCode, formatDoctorReport, runDoctor } from './doctor.mjs';
import { createTaskPack } from './task.mjs';
import { CONTEXT_MODES, createContextPack, DEFAULT_CONTEXT_MAX_BYTES } from './context.mjs';
import { formatReadinessReport, readinessExitCode, READINESS_STAGES, runTaskReadiness } from './readiness.mjs';
import { formatVerificationReport, runVerification, verificationExitCode, DEFAULT_VERIFY_TIMEOUT_MS } from './verify.mjs';
import { applyUpdate, checkForUpdate, formatUpdatePlan, planUpdate, publicUpdateReport, rollbackProject } from './update.mjs';
import { ignorePath, trackPath } from './manage.mjs';
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
  vcp manage ignore <path> [--dir <directory>]
  vcp manage track <path> [--dir <directory>]
  vibe-coding-production doctor [directory] [--json] [--strict]
  vcp doctor [directory] [--json] [--strict]
  vcp inspect [directory] [--json]  (read-only Stage12 classification)
  vcp recovery-plan [directory] [--json]  (read-only; no repair or cleanup)
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
  --no-github        Do not install GitHub issue/PR/workflow files
  --dry-run          Preview without writing files; update computes the full migration plan
  --check            Update: report available VCP version/profile lifecycle changes
  --offline          Update --check: do not query npm; compare only with the running CLI
  --to <version>     Update: require the target version bundled in the running CLI
  --backup <id>      Rollback: restore a specific VCP backup (default: latest)
  --help, -h         Show help
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
    dryRun: false,
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
    pluginDigestPath: null
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
    else if (arg === '--no-github') parsed.includeGitHub = false;
    else if (arg === '--dry-run') parsed.dryRun = true;
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
    githubIntent: parsed.includeGitHub ? 'unspecified' : 'explicit-off',
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
    let githubIntent = parsed.includeGitHub ? 'unspecified' : 'explicit-off';
    if (parsed.includeGitHub) {
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

  if (parsed.version) { console.log(await getCliVersion()); return; }
  if (parsed.help || parsed.command === null) { console.log(HELP); return; }
  if (parsed.command !== 'context' && (parsed.contextBase || parsed.contextHead)) {
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

  if (parsed.command === 'recovery-plan') {
    if(parsed.force||parsed.verifyRun||parsed.dryRun||parsed.updateCheck||
      parsed.yes||parsed.agent!==null||parsed.stack!==null||
      parsed.includeGitHub===false||parsed.strict||parsed.taskDir||
      parsed.rollbackBackup||parsed.updateTo||parsed.updateOffline||
      parsed.contextOutput||parsed.verifyOnly.length) {
      throw new Error('Recovery-plan is a strictly read-only inspection; no action or write flags accepted.');
    }
    const root=path.resolve(parsed.targetDir??'.');
    const state=await inspectManagedRecovery(root);
    const report=state.transaction?.operation==='init'
      ? await planGreenfieldRecovery(root)
      : state.transaction?.operation==='update'&&state.transaction?.formatVersion===2
        ? await planManagedSchemaRecovery(root)
        : {...state,executionAuthorized:false};
    console.log(parsed.json?JSON.stringify(report,null,2)
      : 'VCP recovery preview: '+(report.classification??(report.blocked?'BLOCKED':'INSPECTED'))+
        '\nReason: '+(report.reason??'Transaction inspected')+
        '\nNo file restoration, deletion or cleanup authorized.');
    if(report.blocked||report.classification==='BLOCKED')process.exitCode=1;
    return;
  }

  if (parsed.command === 'inspect') {
    if (parsed.force || parsed.verifyRun || parsed.dryRun || parsed.updateCheck ||
      parsed.agent !== null || parsed.stack !== null || parsed.yes ||
      parsed.includeGitHub === false || parsed.strict || parsed.title ||
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
      githubPreference: parsed.includeGitHub ? null : false
    });
    console.log(parsed.json ? JSON.stringify(preview, null, 2)
      : `VCP zero-write init plan: ${preview.classification} (${preview.assetSet ?? preview.reason})\nProposed claims: ${preview.actions.length}; preserved paths: ${preview.skippedPaths.length}\nHuman decision: ${preview.humanDecisionRequired ? 'required' : 'not required'}\nNo project files written.`);
    if (preview.blocked) process.exitCode = 1;
    return;
  }

  const options = await promptForOptions(parsed);
  validateAgent(options.agent);
  validateStack(options.stack);
  if (options.force) throw new Error('Destructive vcp init --force is disabled; explicit Stage13 adoption apply is separate.');
  const result = await initProject({ targetDir: path.resolve(options.targetDir), agent: options.agent, stack: options.stack, includeGitHub: options.includeGitHub, requestedAdapterIntent: options.requestedAdapterIntent, githubIntent: options.githubIntent, force: false, dryRun: false });
  printInitResult(result);
}
