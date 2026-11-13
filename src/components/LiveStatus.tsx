import { site } from "@/data/site";
import NowPlayingSignal from "./NowPlayingSignal";

/**
 * Two quiet mono rows above the name: the availability signal, then what's
 * playing. What I'm working on sits in the introduction under the name; the
 * latest GitHub push lives with the contribution graph further down.
 */
export default function LiveStatus() {
  return (
    // fixed rows, not one wrapping line: the songs vary in length, and a line
    // that wrapped only for the long ones would nudge the hero every 7s
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
