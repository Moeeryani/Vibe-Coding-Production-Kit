import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemver, compareSemver, readerSupports } from '../lib/semver.mjs';

test('SemVer pre-release chain and release precedence', () => {
  const order = ['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0'];
  for(let i=1;i<order.length;i++) assert.equal(compareSemver(order[i-1],order[i]), -1);
});
test('SemVer build metadata does not influence ordering', () => {
  assert.equal(compareSemver('1.2.3+abc.123', '1.2.3+def.4'), 0);
  assert.equal(compareSemver('1.2.3-alpha+abc', '1.2.3-alpha+xyz'), 0);
});
test('SemVer numeric precision and lexical alphanumeric identifiers', () => {
  assert.equal(compareSemver('9007199254740992.0.0','9007199254740993.0.0'),-1);
  assert.equal(compareSemver('1.0.0-9007199254740992','1.0.0-9007199254740993'),-1);
  assert.equal(compareSemver('1.0.0-1','1.0.0-a'),-1);
  assert.equal(compareSemver('1.0.0-a','1.0.0-b'),-1);
});
test('SemVer malformed or leading-zero versions fail closed', () => {
  for(const value of ['v1.0.0','1.0','1.0.0.0','01.0.0','1.00.0','1.0.03','1.0.0-01','1.0.0-alpha.01','1.0.0+','1.0.0-alpha..1','1.0.0-ä',' 1.0.0', '1.0.0 ',null,{},'9'.repeat(500)]) {
    assert.throws(()=>parseSemver(value), /Invalid semantic version/);
  }
});
test('SemVer minimum-reader compatibility is explicit', () => {
  assert.equal(readerSupports('0.9.3','0.9.3'),true);
  assert.equal(readerSupports('0.9.3','0.9.3-rc.1'),false);
  assert.equal(readerSupports('0.9.3','0.10.0'),true);
});
