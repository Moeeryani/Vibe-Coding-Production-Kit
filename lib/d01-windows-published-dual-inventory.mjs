// D01 old published CLI: TWO-project NTFS namespace guard, read-only.
// An old CLI may mutate the sibling fixture while probing one variant.
// Capture both projects BEFORE and AFTER every fixed original CLI command.
// The result is STILL only an untrusted, non-atomic namespace observation;
// neither matching trees nor failed old CLI exits prove kernel exclusion.
import {validateD01WindowsDisposableFixtureReceipt}
  from './windows-d01-fixture-evidence.mjs';
import {reviewWindowsD01PublishedLegacyObservations}
  from './d01-windows-published-cli-evidence.mjs';
import {compareWindowsD01NamespaceInventoryEnvelopes}
  from './windows-d01-namespace-inventory-comparison.mjs';

function refuse(code){const e=new Error(code);e.code=code;throw e;}
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const variants=Object.freeze(['with-manifest','without-manifest']);

export function compareWindowsD01PublishedDualProjectInventories({
  fixtureReceipt,plan,scenarioId,
  withBefore,withAfter,withoutBefore,withoutAfter
}={}){
  const fixture=validateD01WindowsDisposableFixtureReceipt(fixtureReceipt);
  // Explicitly verify the actual ten CLI arguments before trusting an
  // apparent "scenario" or treating a no-op substituted command as real.
  const reviewed=reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[]
  });
  if(reviewed.totalScenarios!==10||
     !record(plan)||plan.fixtureRoot!==fixture.root||
     plan.fixtureRootIdentity!==fixture.rootIdentity||
     plan.withManifestIdentity!==fixture.withManifestIdentity||
     plan.withoutManifestIdentity!==fixture.withoutManifestIdentity||
     plan.oldSid!==fixture.oldSid||
     plan.writerSid!==fixture.writerSid)
    refuse('E_D01_WINDOWS_DUAL_INVENTORY_PLAN_FIXTURE_MISMATCH');
  const scenario=plan.scenarios.find(s=>s.id===scenarioId);
  if(!scenario||!variants.includes(scenario.variant))
    refuse('E_D01_WINDOWS_DUAL_INVENTORY_SCENARIO_INVALID');
  const results=Object.freeze([
    compareWindowsD01NamespaceInventoryEnvelopes({
      fixtureReceipt,variant:'with-manifest',
      beforeEnvelope:withBefore,afterEnvelope:withAfter
    }),
    compareWindowsD01NamespaceInventoryEnvelopes({
      fixtureReceipt,variant:'without-manifest',
      beforeEnvelope:withoutBefore,afterEnvelope:withoutAfter
    })
  ]);
  // They are on the same disposable NTFS volume and come from one
  // exact source/binary build. A changed helper between ANY captures
  // invalidates the claimed four-way comparison.
  const hashes=[withBefore,withAfter,withoutBefore,withoutAfter].map(x=>
    x.sourceSha256+':'+x.executableSha256);
  if(new Set(hashes).size!==1)
    refuse('E_D01_WINDOWS_DUAL_INVENTORY_BUILD_CHANGED');
  const targeted=results.find(r=>r.variant===scenario.variant);
  const sibling=results.find(r=>r.variant!==scenario.variant);
  const changed=results.flatMap(r=>
    [...r.createdPaths.map(path=>({variant:r.variant,change:'created',path})),
     ...r.removedPaths.map(path=>({variant:r.variant,change:'removed',path})),
     ...r.alteredPaths.map(path=>({variant:r.variant,change:'altered',path}))]);
  return Object.freeze({
    kind:'D01_WINDOWS_PUBLISHED_CLI_DUAL_INVENTORY_V1',
    status:'NO_GO',scenarioId,
    commandProjectVariant:scenario.variant,
    capturedBothProjects:true,
    targetProjectUnchangedObserved:targeted.namespaceUnchangedObserved,
    siblingProjectUnchangedObserved:sibling.namespaceUnchangedObserved,
    bothProjectsUnchangedObserved:
      results.every(r=>r.namespaceUnchangedObserved),
    observedChanges:Object.freeze(changed.map(x=>Object.freeze(x))),
    perProject:Object.freeze(results),
    sameNativeBuildHashReportedForFourCaptures:true,
    independentOldCliExecutionAttested:false,
    independentNativeCaptureProvenanceVerified:false,
    siblingAndParentNamespaceAtomicityProven:false,
    changesBetweenSnapshotsRuledOut:false,
    actualPublishedOldCliWriteDeniedProven:false,
    WindowsNamespaceDurabilityProven:false,
    safeToRetry:false,safeToCleanup:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
