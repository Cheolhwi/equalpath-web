import { FLAGS_KEY, parseFlags, serialiseFlags } from "../shared/arrival-flags.mjs";

// Browser storage for personal arrival flags. A failed write leaves the
// previously saved flags untouched and reports the failure to the caller.
export function readArrivalFlags(storage = globalThis.localStorage) {
  try { return parseFlags(storage?.getItem(FLAGS_KEY)); } catch { return []; }
}
export function writeArrivalFlags(flags, storage = globalThis.localStorage) {
  try { storage.setItem(FLAGS_KEY, serialiseFlags(flags)); return true; } catch { return false; }
}
