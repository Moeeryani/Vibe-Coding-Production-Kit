export function formatOrderId(rawId) {
  if (typeof rawId !== 'string') {
    throw new TypeError('rawId must be a string.');
  }

  const normalized = rawId.trim();
  if (!normalized) {
    throw new Error('rawId must not be empty.');
  }

  return `ord_${normalized}`;
}
