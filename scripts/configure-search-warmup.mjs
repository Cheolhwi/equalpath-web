import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const backend = resolve(root, '../appwrite-backend');
const id = 'web-provider-query';
const enable = process.argv.includes('--enable');
const disable = process.argv.includes('--disable');
assert.ok(!(enable && disable), 'Choose only one warmup setting');
const schedule = disable ? '' : '* * * * *';
if (!enable && !disable) {
  console.log(JSON.stringify({ mode: 'dry_run', function: id, schedule,
    maximumExecutionsPerDay: 1440, databaseReads: 0, externalRouteRequests: 0,
    runtimeSpecification: 'unchanged' }));
  process.exit(0);
}
function run(args) {
  const result = spawnSync(resolve(backend, 'node_modules/.bin/appwrite'), [...args, '--json'], {
    cwd: backend, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000,
  });
  if (result.status !== 0) throw Error(`Appwrite ${args[0]}/${args[1]} failed; raw response withheld`);
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
}
const before = run(['functions', 'get', '--function-id', id]);
assert.equal(before.runtime, 'node-22');
assert.equal(before.runtimeSpecification, 's-0.5vcpu-512mb');
assert.deepEqual(before.execute, ['any']);
assert.deepEqual(before.scopes ?? [], []);
assert.deepEqual(before.events ?? [], []);
assert.equal(before.logging, false);
assert.equal(before.enabled, true);
assert.equal(before.entrypoint, 'server/function.mjs');
assert.ok(!before.providerRepositoryId, 'Do not alter a VCS-managed Function');
if (enable) {
  const receipt = JSON.parse(readFileSync(resolve(root, 'evidence/api-deployment.json'), 'utf8'));
  assert.equal(before.deploymentId, receipt.deployment, 'Activate the intended warmup-capable code first');
  const deployment = run(['functions', 'get-deployment', '--function-id', id, '--deployment-id', receipt.deployment]);
  assert.equal(deployment.status, 'ready');
}
if ((before.schedule ?? '') !== schedule) run([
  'functions', 'update', '--function-id', id, '--name', before.name,
  '--runtime', before.runtime, '--execute', 'any', '--schedule', schedule,
  '--enabled=true', '--logging=false', '--timeout', String(before.timeout),
  '--entrypoint', before.entrypoint, '--commands', before.commands,
  '--build-specification', before.buildSpecification,
  '--runtime-specification', before.runtimeSpecification,
]);
const after = run(['functions', 'get', '--function-id', id]);
assert.equal(after.schedule ?? '', schedule);
for (const field of ['name', 'runtime', 'execute', 'enabled', 'logging', 'timeout',
  'entrypoint', 'commands', 'runtimeSpecification', 'buildSpecification', 'deploymentId'])
  assert.deepEqual(after[field], before[field], `Unexpected change to ${field}`);
for (const field of ['scopes', 'events']) assert.deepEqual(after[field] ?? [], before[field] ?? []);
const receipt = { checkedAt: new Date().toISOString(), function: id, deployment: after.deploymentId,
  previousSchedule: before.schedule ?? '', schedule: after.schedule ?? '',
  runtimeSpecification: after.runtimeSpecification, logging: after.logging,
  maximumExecutionsPerDay: enable ? 1440 : 0, ownerDataAccessed: false, databaseReads: 0,
  note: 'Scheduled readiness reduces idle cold starts; platform recycling and new instances can still start cold.' };
writeFileSync(resolve(root, 'evidence/search-warmup.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
