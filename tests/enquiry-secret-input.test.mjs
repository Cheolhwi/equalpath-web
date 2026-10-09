import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { hiddenInput } from '../scripts/enquiry-secret-input.mjs';

function terminal() {
  const input = new PassThrough(), output = new PassThrough();
  input.isTTY = output.isTTY = true; input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  let text = ''; output.on('data', chunk => { text += chunk; });
  return { input, output, text: () => text };
}
test('cloud setup hides typed secrets and restores the terminal', async () => {
  const tty = terminal(), pending = hiddenInput('Token: ', tty);
  tty.input.write('12345:test_X'); tty.input.write('\x7f'); tty.input.write('Y\r');
  assert.equal(await pending, '12345:test_Y');
  assert.equal(tty.text(), 'Token: \n');
  assert.equal(tty.input.isRaw, false); assert.equal(tty.input.listenerCount('keypress'), 0);
});
test('hidden input cancellation discards partial credentials without echo', async () => {
  const tty = terminal(), pending = hiddenInput('Token: ', tty);
  tty.input.write('12345:test-secret'); tty.input.write('\x03');
  await assert.rejects(pending, /cancelled/);
  assert.equal(tty.text(), 'Token: \n'); assert.equal(tty.input.isRaw, false);
});
test('hidden input refuses non-terminal fallback', async () => {
  await assert.rejects(hiddenInput('Token: ', { input: new PassThrough(), output: new PassThrough() }), /interactive terminal/);
});
