import { site } from "@/data/site";
import NowPlayingSignal from "./NowPlayingSignal";

/**
 * Quiet mono rows above the name: the availability signal, then what's
 * playing on its own row so the song shows whole. Phones drop the song; the
 * availability signal always stays.
 */
export default function LiveStatus() {
  return (
    // two fixed rows, not one wrapping line: the songs vary in length, and a
    // line that wrapped only for the long ones would nudge the hero every 7s
    <div className="flex max-w-full min-w-0 flex-col items-center gap-y-1 font-mono text-sm text-muted md:items-start">
      <span className="inline-flex shrink-0 items-center gap-2">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full bg-status-live shadow-[0_0_8px] shadow-status-live/60"
        />
        Seeking {site.seeking}
      </span>
      {/* phones keep just the availability signal */}
      <span className="flex min-w-0 max-w-full max-sm:hidden">
        <NowPlayingSignal inline />
      </span>
    </div>
  );
}
