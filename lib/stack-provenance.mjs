import { detectStack } from './stacks.mjs';

function assessReactNativeSpecialization(detectedStack, installedStack, requestedStack) {
  const base = {
    specializationEligible: false,
    specializationTarget: null
  };

  if (detectedStack !== 'react-native') {
    return {
      ...base,
      specializationState: 'not-applicable',
      specializationReason: 'Current repository evidence does not identify the React Native profile.'
    };
  }

  if (!installedStack) {
    return {
      ...base,
      specializationState: 'unmanaged',
      specializationReason: 'No installed lifecycle stack profile is recorded.'
    };
  }

  if (installedStack === 'react-native') {
    return {
      ...base,
      specializationState: 'not-needed',
      specializationReason: 'The installed lifecycle profile is already react-native.'
    };
  }

  if (requestedStack === null) {
    return {
      ...base,
      specializationState: 'withheld-unknown-provenance',
      specializationReason: 'React Native evidence is present, but historical stack-selection provenance is unavailable; specialization is withheld rather than inferred.'
    };
  }

  if (requestedStack !== 'auto') {
    return {
      ...base,
      specializationState: 'withheld-explicit',
      specializationReason: `The installed ${installedStack} profile was explicitly selected (requested selector: ${requestedStack}); React Native detection does not override that choice.`
    };
  }

  if (['generic', 'javascript', 'typescript'].includes(installedStack)) {
    return {
      specializationEligible: true,
      specializationTarget: 'react-native',
      specializationState: 'eligible',
      specializationReason: `The installed ${installedStack} profile was auto-selected and current repository evidence now identifies React Native.`
    };
  }

  return {
    ...base,
    specializationState: 'not-applicable',
    specializationReason: `The installed ${installedStack} profile is not eligible for automatic React Native specialization.`
  };
}

export function assessStackProfile(detectedStack, install) {
  const installedStack = install?.stack ?? null;
  const requestedStack = install?.requestedStack ?? null;
  const specialization = assessReactNativeSpecialization(detectedStack, installedStack, requestedStack);

  if (!installedStack) {
    return {
      detectedStack,
      installedStack: null,
      requestedStack: null,
      reprofileEligible: false,
      reprofileTarget: null,
      reprofileState: 'unmanaged',
      ...specialization,
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
      ...specialization,
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
        ...specialization,
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
      ...specialization,
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
      ...specialization,
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
      ...specialization,
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
    ...specialization,
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
