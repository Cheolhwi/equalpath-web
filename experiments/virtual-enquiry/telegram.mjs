// Optional test transport. A single explicitly configured PRIVATE test chat is
// the only recipient. No user-supplied routing, provider contacts or LLM tools.
export function telegramTransport(env = process.env, fetcher = fetch) {
  if (env.TELEGRAM_TEST_ENABLED !== '1') return null;
  const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_TEST_CHAT_ID;
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token ?? '') || !/^[1-9]\d+$/.test(chat ?? ''))
    throw new Error('Configure a bot token and your own private test chat before enabling Telegram.');
  let stopped = false, controller, offset = 0, listener;
  const call = async (method, body, signal = AbortSignal.timeout(20000)) => {
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
      });
      const value = await response.json();
      if (!response.ok || !value.ok) throw Error();
      return value.result;
    } catch { throw new Error('Telegram test connection failed.'); } // Never leak token-bearing URLs.
  };
  const send = text => call('sendMessage', { chat_id: chat, text: text.slice(0, 3900) });
  return {
    name: 'telegram-test-chat',
    async sendRequest(job) {
      return call('sendMessage', { chat_id: chat, text: job.message,
        reply_markup: { inline_keyboard: [
          [{ text: 'Reply using virtual centre rules', callback_data: `ve:${job.id}:rules` }],
          [{ text: 'Test: no places', callback_data: `ve:${job.id}:full` }, { text: 'Test: more information', callback_data: `ve:${job.id}:more_info` }],
        ] },
      });
    },
    sendReply: send,
    async start(onReply) {
      listener = onReply;
      // No webhook deletion or reconfiguration. Refuse to take over another deployment.
      const webhook = await call('getWebhookInfo', {});
      if (webhook.url) throw new Error('This bot already has a webhook. Use a separate test bot.');
      const self = await call('getMe', {});
      async function poll() {
        while (!stopped) {
          try {
            controller = new AbortController();
            const updates = await call('getUpdates', { offset, timeout: 15, allowed_updates: ['callback_query'] }, controller.signal);
            for (const update of updates) {
              offset = Math.max(offset, update.update_id + 1);
              const q = update.callback_query;
              if (!q || String(q.from?.id) !== chat || q.message?.chat?.type !== 'private' || String(q.message.chat.id) !== chat || q.message.from?.id !== self.id) continue;
              const match = /^ve:([a-f0-9]{24}):(rules|full|more_info)$/.exec(q.data ?? '');
              if (!match) continue;
              const applied = await listener(match[1], match[2]);
              await call('answerCallbackQuery', { callback_query_id: q.id, text: applied ? 'Test reply sent to the website.' : 'This test request is no longer waiting.' });
            }
          } catch {
            if (!stopped) await new Promise(resolve => { const t = setTimeout(resolve, 5000); t.unref?.(); });
          }
        }
      }
      void poll();
    },
    stop() { stopped = true; controller?.abort(); },
  };
}
