export function normalizeDeepLink(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized.startsWith('vcp://')) return null;
  return normalized;
}

export function platformGreeting(platform) {
  if (platform === 'android') return 'hello android';
  if (platform === 'ios') return 'hello ios';
  return 'hello mobile';
}
