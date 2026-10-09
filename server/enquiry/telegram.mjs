// Tokens and fixed peer identities are server-only. No provider contact is used.
export function createTelegram(env, fetcher = fetch) {
  const roles = {
    assistant: { token: env.TELEGRAM_ASSISTANT_TOKEN, peer: env.TELEGRAM_MERCHANT_USERNAME },
    merchant: { token: env.TELEGRAM_MERCHANT_TOKEN, peer: env.TELEGRAM_ASSISTANT_USERNAME },
  };
  for (const v of Object.values(roles)) {
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(v.token || '') || !/^[A-Za-z0-9_]{5,32}bot$/i.test(v.peer || '')) throw Error('Telegram configuration is incomplete.');
  }
  const call = async (role, method, body) => {
    try {
      const r = await fetcher(`https://api.telegram.org/bot${roles[role].token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
      });
      const value = await r.json();
      if (!r.ok || !value.ok) throw Error();
      return value.result;
    } catch { throw Error('Telegram could not complete the demo message.'); }
  };
  return { send: (role, text) => {
    if (!roles[role] || text.length > 4000) throw Error('Invalid demo message.');
    return call(role, 'sendMessage', { chat_id: `@${roles[role].peer}`, text, disable_notification: true });
  } };
}
