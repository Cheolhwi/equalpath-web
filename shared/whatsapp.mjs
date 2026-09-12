// Only explicit public WhatsApp links establish a WhatsApp contact.
// Remove tracking / prefilled text; never derive this from a phone field.
export function whatsappLink(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const number = u.hostname === 'wa.me' ? u.pathname.slice(1)
      : u.hostname === 'api.whatsapp.com' && u.pathname === '/send' ? u.searchParams.get('phone') : null;
    const digits = String(number ?? '').replace(/^\+/, '');
    if (!/^60\d{8,11}$/.test(digits)) return null;
    return { display: '+' + digits, href: 'https://wa.me/' + digits };
  } catch { return null; }
}
