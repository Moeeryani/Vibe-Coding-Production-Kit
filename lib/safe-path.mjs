import { lstat } from 'node:fs/promises';
import path from 'node:path';

export const PATH_PURPOSES = Object.freeze(['read-existing','write-new','managed-state']);

function refusal(reason) {
  const error = new Error(`Unsafe project path: ${reason}`);
  error.code = 'E_VCP_PATH';
  return error;
}

async function inspect(file) {
  try { return await lstat(file); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function resolveProjectPath(rootPath, relative, { purpose = 'read-existing' } = {}) {
  if (!PATH_PURPOSES.includes(purpose)) throw new TypeError(`Unknown path purpose: ${purpose}`);
  if (typeof relative !== 'string' || !relative || relative.includes('\0') ||
      relative.includes('\\') || path.isAbsolute(relative) || path.win32.isAbsolute(relative) ||
      /^(?:[A-Za-z]:|\/\/)/.test(relative)) throw refusal('INVALID_RELATIVE');
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' ||
      part.includes(':') || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) {
    throw refusal('INVALID_COMPONENT');
  }
  if (parts[0].toLowerCase() === '.vcp' && purpose !== 'managed-state') throw refusal('RESERVED_STATE');
  if (purpose === 'managed-state' && parts[0] !== '.vcp') throw refusal('STATE_SCOPE');

  const root = path.resolve(rootPath);
  const asc = [];
  for(let current=root;;) {
    asc.push(current);
    const parent=path.dirname(current);
    if(parent===current) break;
    current=parent;
  }
  for(const component of asc.reverse()) {
    const info=await inspect(component);
    if (!info) throw refusal('ROOT_MISSING');
    if (info.isSymbolicLink()) throw refusal('ROOT_LINK');
    if (!info.isDirectory()) throw refusal('ROOT_NOT_DIRECTORY');
  }

  let current=root, missingParent=false;
  for(let i=0;i<parts.length;i++) {
    const final=i===parts.length-1;
    current=path.join(current,parts[i]);
    if (missingParent) continue;
    const info=await inspect(current);
    if(!info) {
      if(purpose==='read-existing') throw refusal('MISSING_INPUT');
      missingParent = !final;
      continue;
    }
    if(info.isSymbolicLink()) throw refusal('LINK_REFUSED');
    if(!final && !info.isDirectory()) throw refusal('PARENT_NOT_DIRECTORY');
    if(final && purpose==='write-new') throw refusal('DESTINATION_EXISTS');
    if(final && !info.isFile()) throw refusal('NOT_REGULAR_FILE');
  }
  return current;
}
