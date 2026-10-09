import { emitKeypressEvents } from 'node:readline';

// A terminal-only prompt. This prompt never echoes or persists the input.
// The caller passes the returned value to the authorized cloud setup.
export function hiddenInput(label, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(Error('Open this setup in an interactive terminal.'));
  }
  return new Promise((resolve, reject) => {
    const previousRaw = Boolean(input.isRaw);
    let value = '', finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      input.off('keypress', onKey); input.off('end', onEnd);
      input.setRawMode(previousRaw); input.pause(); output.write('\n');
      const result = value; value = '';
      if (error) reject(error); else resolve(result);
    };
    const onEnd = () => finish(Error('Setup cancelled. No credential was saved.'));
    const onKey = (text, key = {}) => {
      if (key.ctrl && ['c', 'd'].includes(key.name)) return onEnd();
      if (['return', 'enter'].includes(key.name)) return finish();
      if (['backspace', 'delete'].includes(key.name)) { value = value.slice(0, -1); return; }
      if (key.ctrl || key.meta || !text || !/^[A-Za-z0-9_:-]+$/.test(text)) return;
      value += text;
      if (value.length > 256) finish(Error('Token input is too long. Nothing was saved.'));
    };
    emitKeypressEvents(input); input.setRawMode(true);
    input.on('keypress', onKey); input.once('end', onEnd);
    output.write(label); input.resume();
  });
}
