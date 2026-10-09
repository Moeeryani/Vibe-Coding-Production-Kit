// Strict SemVer 2.0.0 parsing/comparison without unsafe Number precision loss.
const PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new Error(`Invalid semantic version: ${String(value)}`);
  }
  const m = PATTERN.exec(value);
  if (!m) throw new Error(`Invalid semantic version: ${value}`);
  const prerelease = m[4] ? m[4].split('.') : [];
  if (prerelease.some(id => /^\d+$/.test(id) && id.length > 1 && id[0] === '0')) {
    throw new Error(`Invalid semantic version: ${value}`);
  }
  return Object.freeze({ core: Object.freeze(m.slice(1, 4).map(BigInt)),
    prerelease: Object.freeze(prerelease), build: Object.freeze(m[5] ? m[5].split('.') : []) });
}

function compareIdentifier(a, b) {
  if (a === b) return 0;
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return BigInt(a) < BigInt(b) ? -1 : 1;
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : 1;
}

export function compareSemver(left, right) {
  const a = parseSemver(left), b = parseSemver(right);
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : (a.prerelease.length ? -1 : 1);
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i += 1) {
    if (i >= a.prerelease.length) return -1;
    if (i >= b.prerelease.length) return 1;
    const result = compareIdentifier(a.prerelease[i], b.prerelease[i]);
    if (result) return result;
  }
  return 0;
}

export function readerSupports(minimumReaderVersion, currentReaderVersion) {
  return compareSemver(currentReaderVersion, minimumReaderVersion) >= 0;
}
