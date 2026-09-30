export function safeURL(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !/^(localhost|127\.|10\.|192\.168\.|\[)/.test(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export const source = (
  label,
  url,
  retrievedAt = null,
  sourceDate = null,
  kind = "public_directory",
) => ({ label, url: safeURL(url), retrievedAt, sourceDate, kind });
