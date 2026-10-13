import { ShieldCheck } from "lucide-react";

// Privacy notice (12 Oct 2026). A short card the first time someone reaches the
// map, and the full notice in a dialog (from the card or Settings). Keep this
// text true to what the code does: if a data flow changes, change it here and
// raise PRIVACY_VERSION so returning visitors see the card again.
export const PRIVACY_VERSION = 2;
export const PRIVACY_UPDATED = "13 October 2026";
const KEY = "equalpath:privacy:v1";

export function privacySeen(storage) {
  try { return JSON.parse(storage.getItem(KEY) ?? "null")?.version >= PRIVACY_VERSION; } catch { return false; }
}
export function markPrivacySeen(storage) {
  try { storage.setItem(KEY, JSON.stringify({ version: PRIVACY_VERSION })); } catch { /* private mode: shown again next visit */ }
}

export function PrivacyCard({ onRead, onDone }) {
  return <aside className="privacy-card" role="region" aria-labelledby="privacy-card-title">
    <span className="privacy-card-icon" aria-hidden="true"><ShieldCheck size={20} /></span>
    <div className="privacy-card-body">
      <strong id="privacy-card-title">Your privacy</strong>
      <ul>
        <li>No account. We never ask for your child’s name, birthday or health.</li>
        <li>Your place, times and child’s age are used for the search, not kept by us.</li>
        <li>What you save stays in this browser. Delete it any time in Settings.</li>
      </ul>
      <div className="privacy-card-actions">
        <button type="button" className="primary" onClick={onDone}>OK</button>
        <button type="button" className="text-link" onClick={onRead}>Read the privacy notice</button>
      </div>
    </div>
  </aside>;
}

export function PrivacyNoticeBody() {
  return <div className="prose privacy-notice">
    <p className="privacy-updated">Last updated {PRIVACY_UPDATED}</p>
    <p>EqualPath helps parents in Kuala Lumpur and Selangor find childcare for a few hours. It is a student project (FIT5120, team TM01). This notice explains what information the website uses, where it goes and what you can do about it.</p>

    <h3>In short</h3>
    <ul>
      <li>You don’t need an account. EqualPath never asks for your child’s name, date of birth or health, or for your family details.</li>
      <li>What you search for is used to find and plan care. Our service answers the search and doesn’t keep it.</li>
      <li>What you save stays in this browser, on this device. You can delete it at any time.</li>
      <li>No advertising, no tracking cookies and no analytics.</li>
    </ul>

    <h3>What a search uses</h3>
    <ul>
      <li><strong>Starting point</strong> — an address you type, a point on the map, or your location if you tap Use my location and allow it. Used to find nearby centres and estimate drive times.</li>
      <li><strong>Date, start and end times, and your child’s age</strong> (or both children’s ages) — used to check centres’ hours, ages and fees.</li>
      <li>When you look around the map before searching, the middle of the map is used to show nearby centres.</li>
      <li>If you have saved or looked at centres, a search can also include those centres’ IDs so they can be suggested. Nothing else about your activity is sent.</li>
    </ul>
    <p>These go to EqualPath’s search service on Appwrite Cloud (Singapore) when you search. It works out the answer and doesn’t store your search.</p>

    <h3>Other services that help</h3>
    <ul>
      <li><strong>Address search:</strong> the words you type are passed on by our service to Photon (komoot), an OpenStreetMap address search.</li>
      <li><strong>Drive times:</strong> the starting point and centre locations are passed on by our service to the OpenStreetMap routing service.</li>
      <li><strong>The map:</strong> map pictures load from OpenFreeMap. Like any website, it can see your device’s internet address and which part of the map is shown.</li>
      <li><strong>Street photos</strong> of a centre’s surroundings are copies kept by EqualPath, so opening one doesn’t contact Google.</li>
    </ul>

    <h3>Ask for me</h3>
    <ul>
      <li>Ask for me answers your questions about a centre from what EqualPath lists. It runs on your device: your questions aren’t sent to EqualPath, to the centre or to anyone else, and nothing is booked.</li>
      <li>Where this browser has it, Chrome’s built-in AI words English answers. If your device can run it, EqualPath also downloads an open AI model (Qwen, about 0.5–2.5 GB depending on the device) in the background after the map opens, for Chinese answers and as a backup — not on mobile data or with Data Saver on. The files come once from Hugging Face and GitHub and are kept in this browser; your questions still stay on your device. Without a model, the answers come straight from the listing.</li>
    </ul>

    <h3>Contacting a centre yourself</h3>
    <p>Call, WhatsApp and website links open outside EqualPath. What you send goes straight to the centre; we don’t see it.</p>

    <h3>What stays in this browser</h3>
    <ul>
      <li><strong>Only when you choose:</strong> saved centres and notes, saved searches (place, times and how you get there — never the date or age), and flags you add to a centre.</li>
      <li><strong>For suggestions:</strong> your choices and the centres you looked at or compared, with counts and dates — never your place, times or child’s age. Suggestions are worked out in this browser. You can turn this off in Settings.</li>
      <li><strong>Settings:</strong> the last map view and starting point, appearance, motion, and whether you have seen the tour and this notice.</li>
      <li><strong>Only while the page is open:</strong> your plans, checklists and Ask for me chats.</li>
      <li>The AI model downloaded for Ask for me, so it doesn’t download again.</li>
      <li>Street photos you opened are kept so they load faster.</li>
    </ul>
    <p>Nothing is copied to another device or to an account.</p>

    <h3>Sharing a checklist</h3>
    <p>A shared checklist link carries the checklist itself, after the “#”. It isn’t stored on our server, but anyone who has the link can open it.</p>

    <h3>Your choices</h3>
    <ul>
      <li><strong>Settings → Clear data on this device</strong> deletes everything EqualPath keeps in this browser, including a downloaded AI model and your Ask for me chats.</li>
      <li>Location is only used when you tap Use my location. You can block it in your browser’s settings.</li>
    </ul>

    <h3>Changes</h3>
    <p>If this notice changes in a way that matters, we’ll show it to you again.</p>
  </div>;
}
