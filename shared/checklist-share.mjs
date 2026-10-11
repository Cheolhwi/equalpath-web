// Sharing a Checklist (11 Oct 2026, user: "分享的checklist应该直接是那个html内容…不需要让另一个人进入完整的网站").
// The finished checklist — what's already on screen — is packed into the
// link's #fragment (deflate + base64url). public/checklist.html unpacks and
// shows it on its own: no app, no search, no server call, nothing stored.
// Fragments never reach a server.
const toB64 = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64 = (text) => { const s = atob(text.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
export async function packChecklist(data) {
  return toB64(await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream("deflate-raw")));
}
export async function unpackChecklist(text) {
  try {
    const data = JSON.parse(new TextDecoder().decode(await pipe(fromB64(text), new DecompressionStream("deflate-raw"))));
    return data?.v === 1 && typeof data.t === "string" && Array.isArray(data.g) ? data : null;
  } catch { return null; }
}
