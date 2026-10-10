// Stage13 exact native file identity boundary.
// Linux inode/device identifiers are uint64 and may exceed JavaScript's
// 53-bit integer precision. Never ground destructive authority in
// Number(stat.ino), a value that can collide after rounding.
function refuse(code){const e=new Error(code);e.code=code;throw e;}
const exact=/^(?:0|[1-9][0-9]{0,19})$/;
const U64=(1n<<64n)-1n;
export function exactNativeIdentity(receipt,{type=null}={}) {
  const dev=receipt?.devExact,ino=receipt?.inoExact;
  if(!exact.test(dev??'')||!exact.test(ino??'')||
     BigInt(dev)>U64||BigInt(ino)>U64||BigInt(ino)===0n||
     (type!==null&&receipt?.type!==type))
    refuse('E_STAGE13_NATIVE_IDENTITY_UNPROVEN');
  return Object.freeze({dev,ino,type:receipt.type});
}
export function sameExactNativeIdentity(expected,observed,{type=null}={}) {
  const a=exactNativeIdentity(expected,{type});
  const b=exactNativeIdentity(observed,{type});
  if(a.dev!==b.dev||a.ino!==b.ino)
    refuse('E_STAGE13_NATIVE_IDENTITY_CHANGED');
  return true;
}
