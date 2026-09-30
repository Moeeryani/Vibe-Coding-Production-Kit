function sourceTruthSection(taskContent) {
  const match = taskContent.match(/^## Source of truth\s*$/im);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  const rest = taskContent.slice(start);
  const next = rest.search(/^##\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function stripAnchor(value) {
  return value.split('#', 1)[0].trim();
}

function unwrapReferenceValue(value) {
  const trimmed = value.trim();
  const codeSpan = trimmed.match(/^`([^`]+)`$/);
  if (codeSpan) return codeSpan[1].trim();
  const markdownLink = trimmed.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  if (markdownLink) return markdownLink[1].trim();
  return trimmed;
}

function keepReference(value) {
  if (!value) return false;
  if (/^[a-z]+:\/\//i.test(value)) return false;
  if (/^(?:n\/?a|not applicable)$/i.test(value)) return false;
  if (value.startsWith('<')) return false;
  return true;
}

function addReference(found, seen, raw) {
  const value = unwrapReferenceValue(raw);
  if (!keepReference(value) || seen.has(value)) return;
  seen.add(value);
  found.push(value);
}

function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const body = trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed.slice(1);
  return body.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableReferences(section, found, seen) {
  const lines = section.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const header = splitTableRow(lines[index]);
    if (!header) continue;
    const referenceColumn = header.findIndex((cell) => /^references?$/i.test(cell.replace(/`/g, '').trim()));
    if (referenceColumn === -1) continue;

    let rowIndex = index + 1;
    const separator = splitTableRow(lines[rowIndex] ?? '');
    if (separator && isSeparatorRow(separator)) rowIndex += 1;

    for (; rowIndex < lines.length; rowIndex += 1) {
      const cells = splitTableRow(lines[rowIndex]);
      if (!cells) break;
      if (isSeparatorRow(cells)) continue;
      if (referenceColumn >= cells.length) continue;
      addReference(found, seen, cells[referenceColumn]);
    }
    index = rowIndex - 1;
  }
}

function bulletReferences(section, found, seen) {
  for (const line of section.split(/\r?\n/)) {
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!bullet) continue;
    const body = bullet[1].trim();

    const labeled = body.match(/^(?:reference|source|file)\s*:\s*(.+)$/i);
    if (labeled) {
      addReference(found, seen, labeled[1]);
      continue;
    }

    if (/^`[^`]+`$/.test(body) || /^\[[^\]]+\]\([^)]+\)$/.test(body)) {
      addReference(found, seen, body);
    }
  }
}

export function extractSourceTruthReferences(taskContent) {
  const section = sourceTruthSection(taskContent);
  const found = [];
  const seen = new Set();
  tableReferences(section, found, seen);
  bulletReferences(section, found, seen);
  return found;
}

export function sourceTruthReferencePath(value) {
  return stripAnchor(value).replaceAll('\\', '/');
}
