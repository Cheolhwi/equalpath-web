import { existsSync } from 'node:fs';
import { createServer } from 'vite';
// This file is server-only. Tokens must never have the VITE_ prefix.
if (existsSync('.env.telegram.local')) process.loadEnvFile('.env.telegram.local');
process.env.VITE_VIRTUAL_ENQUIRY = '1';
const server = await createServer({ server: { host: '127.0.0.1', port: 4186, strictPort: true } });
await server.listen();
console.log('Website with test button: http://127.0.0.1:4186/#discover');
console.log(process.env.TELEGRAM_TEST_ENABLED === '1' ? 'Telegram: private test chat enabled.' : 'Telegram: not connected. Local simulation only.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
