// D-PC-03: Manual / Assisted / Auto workflow EXECUTION.
//
// This is the deterministic workflow authority. It differs from the Phase 6
// preview router (which only lists steps) by actually running VCP contract
// steps — readiness, context, the mechanical gate, release preview — and by
// maintaining resumable session state. It never writes code, never merges,
// pushes, publishes, deploys, or activates production, never creates human
// approvals, and never bypasses command authority: verification commands
// execute ONLY inside the mechanical gate, which enforces Task Pack command
// authority, and the gate's evidence-only outcome never means approval.
//
// The three modes differ observably in who chooses the next step and whether
// confirmation is required:
//   MANUAL   — the caller sees every available next step and picks one;
//              the runner executes ONLY the chosen next step, and only
//              after explicit approval for that step.
//   ASSISTED — the runner recommends exactly one next step from deterministic
//              project state, explains the recommendation, and requests
//              confirmation before advancing.
//   AUTO     — the runner advances through ordinary, low-risk transitions
//              without per-step confirmation, and STOPS (never improvises)
//              on failed checks, stale evidence, changed state, L3 review,
//              missing approvals/authorization receipts, or unclear intent.
//              Auto automates workflow PROGRESSION; code authorship stays
//              with the coding agent via an explicit handoff step, and the
//              session resumes deterministically afterwards.
//
// Session state is SESSION-scoped only. The lifecycle manifest schema does
// not record workflowMode and is never extended here (see
// inspectWorkflowMode in workflow-router.mjs); durable project-level mode
// persistence remains a separately blocked owner decision. A session can be
// serialized to JSON by the caller (for example with --session-file) and
// resumed later; VCP itself writes no session files and no project files —
// the only project effects are the gate's authorized verification commands.
import path from 'node:path';
import { runTaskReadiness } from './readiness.mjs';
import { createContextPack } from './context.mjs';
import { runMechanicalGate } from './gate-run.mjs';
import { runGatePreview } from './gate-preview.mjs';
import { runReleaseCheck } from './release-check.mjs';
import { readCommitAuthorIdentity, validateL3ReviewEvidence } from './l3-review-evidence.mjs';
import { createGitReviewSnapshot } from './git-review.mjs';
import { readProjectTaskPack } from './task-read.mjs';
import { inspectWorkflowMode, WORKFLOW_MODES } from './workflow-router.mjs';

export const WORKFLOW_RUNNER_VERSION = 'workflow-runner/1';
export const WORKFLOW_PHASES = Object.freeze(['plan', 'implement', 'review', 'release']);
export const WORKFLOW_SESSION_SCHEMA_VERSION = 1;

// Step kinds Auto may NEVER execute, by construction. No built step uses
// these kinds; the guard below fails closed if one ever appears.
export const FORBIDDEN_AUTO_STEP_KINDS = Object.freeze(new Set([
  'MERGE', 'PUSH', 'PUBLISH', 'DEPLOY', 'PRODUCTION_ACTIVATION',
  'APPROVAL_CREATION', 'COMMAND_AUTHORITY_BYPASS',
]));

const TASK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function nowIso() { return new Date().toISOString(); }

function stepDef(id, kind, phase, title, description, executor) {
  return Object.freeze({ id, kind, phase, title, description, executor });
}

const STEP_DEFS = [
  stepDef('readiness-plan', 'READINESS', 'plan',
    'Plan-stage readiness',
    'Check the Task Pack is ready to plan from (outcome, source of truth, acceptance, scope).',
    async (ctx) => {
      const readiness = await runTaskReadiness({ targetDir: ctx.targetDir, task: ctx.task, stage: 'plan' });
      if (readiness.summary.fail > 0) {
        return { status: 'BLOCKED', blocker: 'READINESS_FAILURES', evidence: { summary: readiness.summary, failed: readiness.checks.filter((c) => c.status === 'fail').map((c) => c.id) } };
      }
      return { status: 'COMPLETED', evidence: { summary: readiness.summary } };
    }),
  stepDef('context-plan', 'CONTEXT', 'plan',
    'Planning context',
    'Generate the bounded planning context pack for the coding agent (read-only; no project files are written).',
    async (ctx) => {
      const pack = await createContextPack({ targetDir: ctx.targetDir, task: ctx.task, mode: 'plan' });
      return { status: 'COMPLETED', evidence: { bytes: pack.bytes ?? Buffer.byteLength(pack.content ?? '', 'utf8'), promptProvenance: pack.promptProvenance ?? null } };
    }),
  stepDef('readiness-implement', 'READINESS', 'implement',
    'Implement-stage readiness',
    'Check the Task Pack is eligible before coding (implementation plan and command authority included).',
    async (ctx) => {
      const readiness = await runTaskReadiness({ targetDir: ctx.targetDir, task: ctx.task, stage: 'implement' });
      if (readiness.summary.fail > 0) {
        return { status: 'BLOCKED', blocker: 'READINESS_FAILURES', evidence: { summary: readiness.summary, failed: readiness.checks.filter((c) => c.status === 'fail').map((c) => c.id) } };
      }
      return { status: 'COMPLETED', evidence: { summary: readiness.summary } };
    }),
  stepDef('context-implement', 'CONTEXT', 'implement',
    'Implementation context',
    'Generate the bounded implementation context pack (read-only; no project files are written).',
    async (ctx) => {
      const pack = await createContextPack({ targetDir: ctx.targetDir, task: ctx.task, mode: 'implement' });
      return { status: 'COMPLETED', evidence: { bytes: pack.bytes ?? Buffer.byteLength(pack.content ?? '', 'utf8'), promptProvenance: pack.promptProvenance ?? null } };
    }),
  stepDef('implementation-handoff', 'HANDOFF', 'implement',
    'Implementation handoff to the coding agent',
    'VCP does not write code. This step hands the readiness and context evidence to the coding agent; the session resumes at gate evidence after the change is made.',
    async (ctx) => ({
      status: 'COMPLETED',
      handoff: true,
      evidence: {
        instruction: 'The coding agent implements the Task Pack change, commits it, and the session resumes. No VCP step writes implementation code.',
        task: ctx.task,
      },
    })),
  stepDef('gate-evidence', 'GATE_EVIDENCE', 'implement',
    'Mechanical gate evidence',
    'Collect verification evidence through the mechanical gate. Verification commands execute only under Task Pack command authority; the outcome is evidence only, never approval.',
    async (ctx) => {
      if (!ctx.baseRef) return { status: 'BLOCKED', blocker: 'GATE_BASE_REQUIRED', evidence: {} };
      const report = await runMechanicalGate({
        targetDir: ctx.targetDir, task: ctx.task, baseRef: ctx.baseRef, run: true,
        reviewEvidence: ctx.reviewEvidence ?? null,
      });
      if (report.status === 'BLOCKED') {
        return { status: 'BLOCKED', blocker: 'GATE_BLOCKED', evidence: { blockingReasons: report.blockingReasons, readinessStage: report.readinessStage } };
      }
      return { status: 'COMPLETED', evidence: { gateStatus: report.status, verificationExecuted: report.verificationExecuted, readinessStage: report.readinessStage, headSha: report.postflight?.headSha ?? null } };
    }),
  stepDef('context-review', 'CONTEXT', 'review',
    'Review context',
    'Generate the bounded review context pack against the explicit Git base (read-only).',
    async (ctx) => {
      const pack = await createContextPack({ targetDir: ctx.targetDir, task: ctx.task, mode: 'review', gitBase: ctx.baseRef ?? null });
      return { status: 'COMPLETED', evidence: { bytes: pack.bytes ?? Buffer.byteLength(pack.content ?? '', 'utf8'), promptProvenance: pack.promptProvenance ?? null } };
    }),
  stepDef('gate-preview', 'GATE_PREVIEW', 'review',
    'Gate preview',
    'Preview the gate decision for the change. Read-only; never a pass.',
    async (ctx) => {
      if (!ctx.baseRef) return { status: 'BLOCKED', blocker: 'GATE_BASE_REQUIRED', evidence: {} };
      const preview = await runGatePreview({ targetDir: ctx.targetDir, task: ctx.task, baseRef: ctx.baseRef });
      if (preview.decision.status === 'BLOCKED') {
        return { status: 'BLOCKED', blocker: 'GATE_PREVIEW_BLOCKED', evidence: { level: preview.decision.level, readinessStage: preview.decision.readinessStage, reasons: preview.decision.reasons } };
      }
      return { status: 'COMPLETED', evidence: { level: preview.decision.level, readinessStage: preview.decision.readinessStage } };
    }),
  stepDef('review-evidence', 'REVIEW_EVIDENCE', 'review',
    'Independent review evidence check',
    'Validate supplied L3 review evidence bindings. Validation never authorizes: live L3 authorization is disabled.',
    async (ctx) => {
      if (!ctx.reviewEvidence) return { status: 'SKIPPED', evidence: { reason: 'NO_REVIEW_EVIDENCE_SUPPLIED' } };
      const level = ctx.sessionEvidence['gate-preview']?.level ?? null;
      if (level !== null && level !== 'L3') return { status: 'SKIPPED', evidence: { reason: 'NOT_L3_CHANGE', level } };
      if (!ctx.baseRef) return { status: 'BLOCKED', blocker: 'GATE_BASE_REQUIRED', evidence: {} };
      const snapshot = await createGitReviewSnapshot({ targetDir: ctx.targetDir, baseRef: ctx.baseRef });
      const record = await readProjectTaskPack(ctx.targetDir, `docs/tasks/${ctx.task}.md`);
      const changeAuthorIdentity = await readCommitAuthorIdentity({ targetDir: ctx.targetDir, sha: snapshot.headSha });
      const validation = validateL3ReviewEvidence(ctx.reviewEvidence, {
        taskSlug: ctx.task, taskSha256: record.sha256, baseSha: snapshot.baseSha, headSha: snapshot.headSha,
        changedFiles: snapshot.changedFiles.map((f) => f.path), changeAuthorIdentity,
      });
      return {
        status: 'BLOCKED',
        blocker: validation.valid ? 'L3_AUTHORIZATION_DISABLED' : 'L3_REVIEW_EVIDENCE_INVALID',
        evidence: { validation },
      };
    }),
  stepDef('release-check-preview', 'RELEASE_PREVIEW', 'release',
    'Release evidence preview',
    'Preview release evidence only. Publication, tags, and releases remain manual and require a human decision.',
    async (ctx) => {
      if (!ctx.releaseVersion) return { status: 'BLOCKED', blocker: 'RELEASE_VERSION_REQUIRED', evidence: {} };
      const report = await runReleaseCheck({ targetDir: ctx.targetDir, version: ctx.releaseVersion, run: false });
      if (!report.success) {
        return { status: 'BLOCKED', blocker: 'RELEASE_CHECKS_FAILED', evidence: { failing: (report.checks ?? []).filter((c) => c.status !== 'pass').map((c) => c.id) } };
      }
      return { status: 'COMPLETED', evidence: { version: ctx.releaseVersion, checks: (report.checks ?? []).length } };
    }),
];

function defsForPhase(phase) { return STEP_DEFS.filter((d) => d.phase === phase); }
export function listWorkflowSteps(phase) {
  if (!WORKFLOW_PHASES.includes(phase)) fail('E_WORKFLOW_PHASE');
  return defsForPhase(phase).map((d) => ({ id: d.id, kind: d.kind, phase: d.phase, title: d.title, description: d.description }));
}

export function createWorkflowSession({ targetDir, task, mode, phase = 'plan', sessionId = null } = {}) {
  if (typeof task !== 'string' || !TASK.test(task)) fail('E_WORKFLOW_TASK');
  if (!WORKFLOW_PHASES.includes(phase)) fail('E_WORKFLOW_PHASE');
  inspectWorkflowMode({ requestedMode: mode });
  const id = sessionId ?? `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    schemaVersion: WORKFLOW_SESSION_SCHEMA_VERSION,
    runnerVersion: WORKFLOW_RUNNER_VERSION,
    sessionId: id,
    targetDir: path.resolve(targetDir ?? '.'),
    task,
    mode,
    phase,
    status: 'PENDING',
    completedSteps: [],
    transcript: [{ at: nowIso(), event: 'SESSION_CREATED', detail: `mode=${mode} phase=${phase}` }],
    blockers: [],
    modeHistory: [{ mode, at: nowIso(), reason: 'session-created' }],
    stopRequested: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function serializeWorkflowSession(session) {
  const copy = { ...session, transcript: session.transcript.map((t) => ({ ...t })), completedSteps: session.completedSteps.map((s) => ({ ...s })), blockers: [...session.blockers], modeHistory: session.modeHistory.map((m) => ({ ...m })) };
  return JSON.stringify(copy, null, 2);
}

export function deserializeWorkflowSession(text) {
  let data;
  try { data = JSON.parse(text); } catch { fail('E_WORKFLOW_SESSION'); }
  if (!isObject(data) || data.schemaVersion !== WORKFLOW_SESSION_SCHEMA_VERSION ||
    typeof data.sessionId !== 'string' || typeof data.targetDir !== 'string' ||
    typeof data.task !== 'string' || !TASK.test(data.task) ||
    !WORKFLOW_MODES.includes(data.mode) || !WORKFLOW_PHASES.includes(data.phase) ||
    !Array.isArray(data.completedSteps) || !Array.isArray(data.transcript) || !Array.isArray(data.blockers) ||
    !Array.isArray(data.modeHistory)) fail('E_WORKFLOW_SESSION');
  for (const step of data.completedSteps) {
    if (!isObject(step) || typeof step.id !== 'string' || !STEP_DEFS.some((d) => d.id === step.id)) fail('E_WORKFLOW_SESSION');
  }
  return data;
}

export function switchWorkflowMode(session, newMode, { reason = 'user-requested' } = {}) {
  if (session.status === 'RUNNING') fail('E_WORKFLOW_MODE_SWITCH_WHILE_RUNNING');
  inspectWorkflowMode({ requestedMode: newMode });
  const previous = session.mode;
  session.mode = newMode;
  session.modeHistory.push({ mode: newMode, at: nowIso(), reason });
  session.transcript.push({ at: nowIso(), event: 'MODE_SWITCHED', detail: `${previous} -> ${newMode} (${reason})` });
  session.updatedAt = nowIso();
  return session;
}

export function requestWorkflowStop(session, { reason = 'user-requested stop' } = {}) {
  session.stopRequested = true;
  session.transcript.push({ at: nowIso(), event: 'STOP_REQUESTED', detail: reason });
  session.updatedAt = nowIso();
  return session;
}

function snapshot(session) {
  return {
    sessionId: session.sessionId, task: session.task, mode: session.mode,
    phase: session.phase, status: session.status,
    completedSteps: session.completedSteps.map((s) => s.id), blockers: [...session.blockers],
  };
}

// Run the session forward from its current phase through `phases` (default:
// from the session phase to the end). Returns the mutated session.
export async function runWorkflowSession(session, {
  baseRef = null, releaseVersion = null, reviewEvidence = null,
  phases = null, decide = null, shouldStop = null, onProgress = null, maxSteps = 50,
} = {}) {
  if (!isObject(session) || session.schemaVersion !== WORKFLOW_SESSION_SCHEMA_VERSION) fail('E_WORKFLOW_SESSION');
  if (releaseVersion !== null && !VERSION.test(releaseVersion)) fail('E_WORKFLOW_RELEASE_VERSION');
  if (session.status === 'RUNNING') fail('E_WORKFLOW_ALREADY_RUNNING');
  const startIndex = WORKFLOW_PHASES.indexOf(session.phase);
  const wanted = phases ?? WORKFLOW_PHASES.slice(startIndex);
  for (const phase of wanted) {
    if (!WORKFLOW_PHASES.includes(phase)) fail('E_WORKFLOW_PHASE');
    if (WORKFLOW_PHASES.indexOf(phase) < startIndex) fail('E_WORKFLOW_PHASE_ORDER');
  }
  session.status = 'RUNNING';
  session.transcript.push({ at: nowIso(), event: 'RUN_STARTED', detail: `mode=${session.mode} phases=${wanted.join(',')}` });
  const sessionEvidence = {};
  for (const completed of session.completedSteps) sessionEvidence[completed.id] = completed.evidence ?? {};
  let executed = 0;

  try {
    for (const phase of wanted) {
      session.phase = phase;
      const defs = defsForPhase(phase);
      for (const def of defs) {
        if (session.completedSteps.some((s) => s.id === def.id)) continue;
        const remaining = defs.filter((d) => !session.completedSteps.some((s) => s.id === d.id));
        if (executed >= maxSteps) { session.status = 'STOPPED'; session.blockers = ['STEP_LIMIT_REACHED']; break; }
        if (session.stopRequested || shouldStop?.()) {
          session.status = 'STOPPED';
          session.transcript.push({ at: nowIso(), event: 'STOPPED', detail: 'stop requested before step ' + def.id });
          break;
        }
        if (FORBIDDEN_AUTO_STEP_KINDS.has(def.kind)) {
          session.status = 'BLOCKED';
          session.blockers = ['FORBIDDEN_STEP_KIND'];
          session.transcript.push({ at: nowIso(), event: 'STEP_REFUSED', stepId: def.id, detail: `kind ${def.kind} is never executed` });
          break;
        }
        // Mode-specific authorization.
        if (session.mode === 'manual') {
          if (typeof decide !== 'function') {
            session.status = 'AWAITING_CONFIRMATION';
            session.transcript.push({ at: nowIso(), event: 'AWAITING_CONFIRMATION', stepId: def.id, detail: 'manual mode requires an explicit per-step decision' });
            break;
          }
          const available = remaining.map((d) => ({ id: d.id, kind: d.kind, title: d.title, description: d.description }));
          const choice = await decide({ mode: 'manual', availableSteps: available, nextStep: available[0], state: snapshot(session) });
          if (!isObject(choice) || choice.stop === true) { session.status = 'STOPPED'; break; }
          if (choice.stepId !== def.id || choice.approved !== true) {
            session.status = 'AWAITING_CONFIRMATION';
            session.transcript.push({ at: nowIso(), event: 'AWAITING_CONFIRMATION', stepId: def.id, detail: 'manual choice did not approve the next step in order' });
            break;
          }
        } else if (session.mode === 'assisted') {
          if (typeof decide !== 'function') {
            session.status = 'AWAITING_CONFIRMATION';
            session.transcript.push({ at: nowIso(), event: 'AWAITING_CONFIRMATION', stepId: def.id, detail: 'assisted mode requires confirmation of the recommendation' });
            break;
          }
          const explanation = `Recommended next step: ${def.title}. ${def.description} ` +
            `Evidence so far in this session: ${session.completedSteps.map((s) => s.id).join(', ') || 'none'}. ` +
            `Blockers so far: ${session.blockers.join(', ') || 'none'}.`;
          const answer = await decide({ mode: 'assisted', recommendation: { id: def.id, kind: def.kind, title: def.title, description: def.description }, explanation, state: snapshot(session) });
          if (!isObject(answer) || answer.stop === true) { session.status = 'STOPPED'; break; }
          if (answer.approved !== true) {
            session.status = 'AWAITING_CONFIRMATION';
            session.transcript.push({ at: nowIso(), event: 'AWAITING_CONFIRMATION', stepId: def.id, detail: 'assisted recommendation declined' });
            break;
          }
        }
        // AUTO: no per-step confirmation for ordinary steps. The stop
        // conditions are the step outcomes themselves (below), never a
        // silent skip: a blocked step ends the run.
        let result;
        try {
          result = await def.executor({
            targetDir: session.targetDir, task: session.task, baseRef, releaseVersion,
            reviewEvidence, sessionEvidence,
          });
        } catch (error) {
          result = { status: 'BLOCKED', blocker: 'STEP_EXECUTION_FAILED', evidence: { error: error?.message ?? String(error) } };
        }
        executed += 1;
        sessionEvidence[def.id] = result.evidence ?? {};
        session.transcript.push({
          at: nowIso(), event: `STEP_${result.status}`, stepId: def.id,
          detail: result.blocker ? `${def.title}: ${result.blocker}` : def.title,
        });
        if (result.status === 'SKIPPED') {
          // Skipped steps do not count as completed and do not block.
        } else if (result.status === 'COMPLETED') {
          session.completedSteps.push({ id: def.id, kind: def.kind, phase, status: 'COMPLETED', evidence: result.evidence ?? {}, at: nowIso() });
          if (result.handoff === true) {
            session.status = 'AWAITING_IMPLEMENTATION';
            session.updatedAt = nowIso();
            onProgress?.({ session: snapshot(session), step: def, result });
            return session;
          }
        } else {
          session.status = 'BLOCKED';
          session.blockers = [result.blocker ?? 'STEP_BLOCKED'];
          session.updatedAt = nowIso();
          onProgress?.({ session: snapshot(session), step: def, result });
          return session;
        }
        session.updatedAt = nowIso();
        onProgress?.({ session: snapshot(session), step: def, result });
      }
      if (session.status === 'BLOCKED' || session.status === 'STOPPED' || session.status === 'AWAITING_CONFIRMATION' || session.status === 'AWAITING_IMPLEMENTATION') break;
    }
  } finally {
    if (session.status === 'RUNNING') session.status = 'COMPLETED';
  }
  session.updatedAt = nowIso();
  return session;
}
