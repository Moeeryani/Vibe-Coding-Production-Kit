import { detectStack } from './stacks.mjs';

export async function detectStackProfileChange(target, install) {
  if (install?.stack !== 'generic' || install?.requestedStack !== 'auto') return null;

  const detected = await detectStack(target);
  if (detected === 'generic') return null;

  return {
    from: 'generic',
    to: detected,
    reason: 'Stored generic profile was auto-selected and repository evidence now identifies a supported stack.'
  };
}
