import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { writeFile, access, chmod } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';

// Run by the user in a terminal. Never request or print credentials in chat.
if (!stdin.isTTY) { console.error('Run this setup in your own terminal.'); process.exit(1); }
console.log('Create a separate test bot in Telegram: open @BotFather and send /newbot.');
console.log('Keep its token private. This setup sends no messages and changes no webhook.');
function secret() {
  stdout.write('Bot token (hidden): '); emitKeypressEvents(stdin); stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => { stdin.off('keypress', onKey); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Setup cancelled.')); }
      else if (key.name === 'return') { finish(); resolve(value.trim()); }
      else if (key.name === 'backspace') { value = value.slice(0, -1); }
      else if (text && /^[A-Za-z0-9:_-]+$/.test(text)) value = (value + text).slice(0, 200);
    };
    stdin.on('keypress', onKey);
  });
}
try {
  const token = await secret();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('The token format is invalid. Nothing was saved.');
  const call = async (method, body = {}) => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const v = await r.json(); if (!r.ok || !v.ok) throw Error(); return v.result;
    } catch { throw new Error('Telegram could not be reached or the token was rejected. Nothing was saved.'); }
  };
  const bot = await call('getMe'), webhook = await call('getWebhookInfo');
  if (webhook.url) throw new Error('This bot already has a webhook. Create a separate test bot. Nothing was changed.');
  console.log(`Open @${bot.username} in your own private Telegram chat and send /start.`);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    await rl.question('Press Enter after sending /start. ');
    const updates = await call('getUpdates', { timeout: 0, allowed_updates: ['message'] });
    const chats = [...new Map(updates.filter(u => u.message?.chat?.type === 'private' && u.message?.text?.startsWith('/start') && u.message.chat.id === u.message.from?.id).map(u => [String(u.message.chat.id), u.message.chat])).values()];
    if (chats.length !== 1) throw new Error('Expected one private /start chat on this new test bot. Use a fresh bot and retry.');
    const chat = chats[0];
    const answer = await rl.question(`Use your private test chat ${chat.id} (${chat.first_name || 'Telegram user'})? Type yes: `);
    if (answer.trim().toLowerCase() !== 'yes') throw new Error('Setup cancelled. Nothing was saved.');
    try { await access('.env.telegram.local');
      if ((await rl.question('A local test config exists. Replace only that config? Type yes: ')).trim().toLowerCase() !== 'yes') throw new Error('Setup cancelled.');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await writeFile('.env.telegram.local', `# Private local test configuration. Never commit this file.\nTELEGRAM_TEST_ENABLED=1\nTELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_TEST_CHAT_ID=${chat.id}\n`, { mode: 0o600 });
    await chmod('.env.telegram.local', 0o600);
    console.log('Test configuration saved locally. Restart with npm run dev:enquiry.');
    console.log('Only your private test chat can receive requests. The website will wait for your simulated-reply button.');
  } finally { rl.close(); }
} catch (e) { console.error(e.message); process.exitCode = 1; }
