"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, COLD_START_MS, hasApi, postJSON, warmApi } from "@/lib/api";
import type { CommunityFlower } from "./adventure-state";

type Entry = { id: number; name: string; message: string; flower: string; color: string; at: string };
type Wall = { entries: Entry[] };
type Submission = { name: string; message: string; flower: string; color: string; state: "pending" | "published" | "error"; status: string };
const FLOWERS = ["daisy", "tulip", "sunflower", "rose", "poppy"];
const COLORS: Record<string, string> = { coral: "#fb7185", gold: "#fbbf24", violet: "#a78bfa", blue: "#60a5fa", mint: "#34d399", pink: "#f472b6" };

function validWall(value: unknown): value is Wall {
  if (!value || typeof value !== "object" || !Array.isArray((value as Wall).entries)) return false;
  return (value as Wall).entries.every((entry) => !!entry && Number.isSafeInteger(entry.id) &&
    typeof entry.name === "string" && entry.name.length <= 40 && typeof entry.message === "string" && entry.message.length <= 140 &&
    FLOWERS.includes(entry.flower) && typeof entry.color === "string" && entry.color in COLORS &&
    typeof entry.at === "string" && Number.isFinite(Date.parse(entry.at)));
}

export default function CommunityWall({ onFlowers }: { onFlowers?: (flowers: readonly CommunityFlower[]) => void }) {
  const [wall, setWall] = useState<Wall | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState(""); const [message, setMessage] = useState("");
  const [flower, setFlower] = useState("daisy"); const [color, setColor] = useState("coral");
  const [submission, setSubmission] = useState<Submission | null>(null); const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    if (!hasApi) { setError("The community wall isn’t configured for this site build."); setLoading(false); return; }
    try {
      const result: unknown = await api<unknown>("/island-wall");
      if (!validWall(result)) throw new Error("Invalid wall response");
      setWall(result);
      onFlowers?.(result.entries.map(({ flower, color, name, message, at }) => ({ flower, color, name, message, at })));
    }
    catch (e) { setError(e instanceof ApiError && e.status === 503 ? "The rooftop wall is temporarily unavailable." : "Couldn’t load the wall. It may be waking up."); }
    finally { setLoading(false); }
  }, [onFlowers]);
  useEffect(() => {
    let active = true;
    warmApi();
    void Promise.resolve().then(() => {
      if (!hasApi) throw new Error("The community wall isn’t configured for this site build.");
      return api<unknown>("/island-wall");
    }).then((result) => {
      if (!active) return;
      if (!validWall(result)) throw new Error("Invalid wall response");
      setWall(result);
      onFlowers?.(result.entries.map(({ flower, color, name, message, at }) => ({ flower, color, name, message, at })));
    }).catch((e: unknown) => {
      if (!active) return;
      setError(!hasApi ? "The community wall isn’t configured for this site build." : e instanceof ApiError && e.status === 503 ? "The rooftop wall is temporarily unavailable." : "Couldn’t load the wall. It may be waking up.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onFlowers]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setSubmission(null);
    try {
      const data = new FormData(event.currentTarget);
      const result = await api<{ pending: boolean; message?: string }>("/island-wall", { ...postJSON({ name, message, flower, color, website: data.get("website") }), timeoutMs: COLD_START_MS });
      const pending=result.pending!==false;
      setSubmission({name,message,flower,color,state:pending?"pending":"published",status:result.message??(pending?"Your note is waiting for review.":"Your note was approved and published.")});
      setName(""); setMessage("");
      if(!pending)await refresh();
    } catch (e) { setSubmission({name,message,flower,color,state:"error",status:e instanceof ApiError ? e.reason ?? "The wall couldn’t be reached. Please try again." : "The wall couldn’t be reached. Please try again."}); }
    finally { setSending(false); }
  }

  return <section aria-label="Community rooftop wall" className="community-wall">
    <header><strong>Rooftop garden</strong><span>Approved notes are public</span></header>
    <form onSubmit={submit}>
      <p className="community-wall__hint">Notes are limited to 140 characters. New notes stay private until moderator approval.</p>
      <label>Your name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required /></label>
      <label>Message <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={140} required rows={2} /></label>
      <div className="community-wall__choices">
        <label>Flower <select value={flower} onChange={(e) => setFlower(e.target.value)}>{FLOWERS.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Color <select value={color} onChange={(e) => setColor(e.target.value)}>{Object.keys(COLORS).map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      <label className="community-wall__trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" name="website" /></label>
      <button disabled={sending || !hasApi}>{sending ? "Sending…" : "Plant note"}</button>
    </form>
    {submission&&<aside className={`community-wall__submission is-${submission.state}`} role="status">
      <strong>{submission.state==="pending"?"Waiting for moderator approval":submission.state==="published"?"Published to the rooftop":"Couldn’t send this note"}</strong>
      <p><span>{submission.name}</span>: “{submission.message}”</p>
      <small>{submission.state==="pending"?`This ${submission.flower} postcard is not in the public wall or garden yet. ${submission.status}`:submission.status}</small>
    </aside>}
    <div aria-live="polite" className="community-wall__approved">
      <h3>Approved rooftop notes</h3>
      {loading ? <p>Loading approved notes…</p> : error ? <p>{error} <button type="button" onClick={() => void refresh()}>Retry</button></p> : wall?.entries.length ? wall.entries.map((entry) => <article key={entry.id} className="community-wall__entry">
        <svg className={`community-wall__flower community-wall__flower--${entry.flower}`} viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" style={{ color: COLORS[entry.color] }}>
          {Array.from({ length: entry.flower === "sunflower" ? 12 : 6 }, (_, i) => <ellipse key={i} cx="16" cy="8" rx={entry.flower === "sunflower" ? 2.2 : 3.1} ry="5" transform={`rotate(${i * (entry.flower === "sunflower" ? 30 : 60)} 16 16)`} fill="currentColor" />)}
          <circle cx="16" cy="16" r="4" fill="#f5d36c" />
        </svg>
        <div><strong>{entry.name}</strong><p>{entry.message}</p><time dateTime={entry.at}>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(entry.at))}</time></div>
      </article>) : <p>No approved notes yet. New notes appear here after review.</p>}
    </div>
  </section>;
}
