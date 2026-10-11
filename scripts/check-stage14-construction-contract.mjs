// Stage14 construction contract: no mutation or release authority is gained
// from passing this source-level check. Acceptance remains a separate gate.
import assert from 'node:assert/strict';
import {ASSET_SETS,STAGE14_SAFE_CONSUMER_PATHS,
  STAGE14_PACKAGE_RUNTIME,STAGE14_PROVIDER_SOURCE_DOCS,assertCatalogInventory,
  classifyConsumerAsset,selectAssetPaths} from '../lib/asset-catalog.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE} from '../lib/managed-migration.mjs';

assert.deepEqual(ASSET_SETS,[
  'legacy-full-v1','greenfield-safe-v1','brownfield-minimal-v1'
]);
assertCatalogInventory(STAGE14_SAFE_CONSUMER_PATHS);
assertCatalogInventory(STAGE14_PACKAGE_RUNTIME);
assertCatalogInventory(STAGE14_PROVIDER_SOURCE_DOCS);
for(const p of STAGE14_PROVIDER_SOURCE_DOCS){
  assert.equal(classifyConsumerAsset(p),'package-only');
  assert.deepEqual(selectAssetPaths('greenfield-safe-v1',[p]),[]);
}
for(const sourceOnly of STAGE14_PACKAGE_RUNTIME){
  assert.equal(classifyConsumerAsset(sourceOnly),'package-only');
  for(const assetSet of ASSET_SETS.slice(1)){
    assert.deepEqual(selectAssetPaths(assetSet,[sourceOnly]),[]);
  }
}
for(const sourceOnly of ['docs/ROADMAP.md','docs/CLI.md',
  'examples/feature-spec.example.md']){
  assert.deepEqual(selectAssetPaths('greenfield-safe-v1',[sourceOnly]),[]);
}
assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.status,'NO_GO');
assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
console.log('STAGE14_SOURCE_CONSTRUCTION_PRESENT_ONLY; CHECKPOINT_A_PENDING; D01_NO_GO');
