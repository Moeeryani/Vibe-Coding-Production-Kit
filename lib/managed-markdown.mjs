// Stage12 byte-preserving managed-section primitive. Does not perform filesystem writes.
const ID = /^[a-z0-9-]{1,64}$/;
const BEGIN = /^<!-- VCP:BEGIN:([a-z0-9-]{1,64}) -->$/;
const END = /^<!-- VCP:END:([a-z0-9-]{1,64}) -->$/;
const MAX_BYTES = 4 * 1024 * 1024;
function violation(reason) { const e = new Error(`Invalid VCP managed Markdown: ${reason}`); e.code='E_VCP_SECTION'; return e; }
function bytes(content) {
  const result = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (result.length > MAX_BYTES) throw violation('DOC_TOO_LARGE');
  return result;
}
function lines(buffer) {
  const result=[];
  let p=0;
  while(p<buffer.length) {
    const i=buffer.indexOf(10,p), end=i<0?buffer.length:i+1;
    let textEnd=end;
    if(i>=0) textEnd--;
    if(textEnd>p && buffer[textEnd-1]===13) textEnd--;
    result.push({start:p,end,raw:buffer.toString('utf8',p,textEnd)});
    p=end;
  }
  return result;
}
export function parseManagedSections(content) {
  const input=bytes(content), locations=[], ids=new Set();
  let open=null, fence=null;
  for(const line of lines(input)) {
    const raw=line.raw;
    // CommonMark fenced blocks: at most 3 indent spaces, backticks or tildes.
    const opening=raw.match(/^ {0,3}(`{3,}|~{3,})[^\r\n]*$/);
    if(fence) {
      if(opening && opening[1][0]===fence.char && opening[1].length>=fence.length &&
        /^ {0,3}(?:`+|~+)\s*$/.test(raw)) fence=null;
      continue;
    }
    if(opening) { fence={char:opening[1][0],length:opening[1].length}; continue; }
    const start=BEGIN.exec(raw), stop=END.exec(raw);
    if(start) {
      const id=start[1];
      if(open) throw violation('NESTED_BEGIN');
      if(ids.has(id)) throw violation('DUPLICATE_ID');
      ids.add(id);
      open={id,beginOffset:line.start,contentStart:line.end};
    } else if(stop) {
      if(!open) throw violation('ORPHAN_END');
      if(open.id!==stop[1]) throw violation('MISMATCHED_END');
      locations.push({id:open.id,beginOffset:open.beginOffset,contentStart:open.contentStart,
        contentEnd:line.start,endOffset:line.end});
      open=null;
    } else if(raw.startsWith('<!-- VCP:BEGIN:') || raw.startsWith('<!-- VCP:END:')) {
      throw violation('MALFORMED_MARKER');
    }
  }
  if(open) throw violation('MISSING_END');
  return locations;
}
export function replaceManagedSection(documentBytes,id,replacement) {
  if(!ID.test(id)) throw violation('INVALID_ID');
  const src=bytes(documentBytes), regions=parseManagedSections(src);
  const matching=regions.find(x=>x.id===id);
  if(!matching) throw violation('UNKNOWN_SECTION');
  const newBody=bytes(replacement);
  if(newBody.toString('utf8').split(/\r?\n/).some(line =>
    line.startsWith('<!-- VCP:BEGIN:') || line.startsWith('<!-- VCP:END:'))) {
    throw violation('MARKER_IN_REPLACEMENT');
  }
  return Buffer.concat([src.subarray(0,matching.contentStart),newBody,
    src.subarray(matching.contentEnd)]);
}
