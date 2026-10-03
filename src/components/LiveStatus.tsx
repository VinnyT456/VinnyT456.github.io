import { site } from "@/data/site";
import NowPlayingSignal from "./NowPlayingSignal";

/**
 * One quiet mono line above the name: the availability signal, then what's
 * playing. Was two lines (status + a clock that only ever showed the
 * *visitor's* own time, plus a separate soundtrack row); one line gives the
 * hero one less thing to read. The track truncates first as space runs out,
 * and phones drop it — the availability signal always stays whole.
 */
export default function LiveStatus() {
  return (
    <div className="flex max-w-full min-w-0 items-center justify-center gap-x-3 font-mono text-sm text-muted md:justify-start">
      <span className="inline-flex shrink-0 items-center gap-2">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full bg-status-live shadow-[0_0_8px] shadow-status-live/60"
        />
        Seeking {site.seeking}
      </span>
      {/* the song only where it fits whole-ish — on a phone "Frank …" says
          less than nothing, so phones keep just the availability signal */}
      <span aria-hidden className="shrink-0 text-muted/40 max-sm:hidden">
        ·
      </span>
      <span className="flex min-w-0 max-sm:hidden">
        <NowPlayingSignal inline />
      </span>
    </div>
  );
}
