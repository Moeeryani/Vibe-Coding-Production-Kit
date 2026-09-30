import { detectStack } from './stacks.mjs';

export function assessStackProfile(detectedStack, install) {
  const installedStack = install?.stack ?? null;
  const requestedStack = install?.requestedStack ?? null;

  if (!installedStack) {
    return {
      detectedStack,
      installedStack: null,
      requestedStack: null,
      reprofileEligible: false,
      reprofileTarget: null,
      reprofileState: 'unmanaged',
      reason: 'No installed lifecycle stack profile is recorded.'
    };
  }

  if (installedStack !== 'generic') {
    return {
      detectedStack,
      installedStack,
      requestedStack,
      reprofileEligible: false,
      reprofileTarget: null,
      reprofileState: 'not-applicable',
      reason: `Installed lifecycle profile is already ${installedStack}; automatic re-profiling only applies to auto-selected generic installs.`
    };
  }

  if (requestedStack === 'auto') {
    if (detectedStack !== 'generic') {
      return {
        detectedStack,
        installedStack,
        requestedStack,
        reprofileEligible: true,
        reprofileTarget: detectedStack,
        reprofileState: 'eligible',
        reason: 'Stored generic profile was auto-selected and repository evidence now identifies a supported stack.'
      };
    }

    return {
      detectedStack,
      installedStack,
      requestedStack,
      reprofileEligible: false,
      reprofileTarget: null,
      reprofileState: 'not-needed',
      reason: 'Stored generic profile was auto-selected, but current repository evidence still resolves to generic.'
    };
  }

  if (requestedStack === 'generic') {
    return {
      detectedStack,
      installedStack,
      requestedStack,
      reprofileEligible: false,
      reprofileTarget: null,
      reprofileState: 'withheld-explicit',
      reason: 'Stored generic profile was explicitly selected; repository detection does not override that choice.'
    };
  }

  if (requestedStack === null) {
    return {
      detectedStack,
      installedStack,
      requestedStack,
      reprofileEligible: false,
      reprofileTarget: null,
      reprofileState: 'withheld-unknown-provenance',
      reason: 'Stored generic profile has no stack-selection provenance; re-profiling is intentionally withheld rather than inferring historical intent.'
    };
  }

  return {
    detectedStack,
    installedStack,
    requestedStack,
    reprofileEligible: false,
    reprofileTarget: null,
    reprofileState: 'withheld-non-auto',
    reason: `Stored generic profile was not auto-selected (requested selector: ${requestedStack}); repository detection does not override that lifecycle choice.`
  };
}

export async function detectStackProfileChange(target, install) {
  if (install?.stack !== 'generic' || install?.requestedStack !== 'auto') return null;

  const detected = await detectStack(target);
  const assessment = assessStackProfile(detected, install);
  if (!assessment.reprofileEligible) return null;

  return {
    from: assessment.installedStack,
    to: assessment.reprofileTarget,
    reason: assessment.reason
  };
}
