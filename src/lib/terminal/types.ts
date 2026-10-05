/**
 * Shared types for the Experience shell.
 *
 * Output is a flat list of lines. Each line carries an optional tone so the
 * renderer can colour errors / the prompt / accents sparingly — most text is
 * neutral, per the terminal's restrained palette.
 */

export type LineTone =
  | "default"
  | "muted"
  | "accent"
  | "error"
  | "prompt"
  // art tones — used only by colored ASCII (whoami avatar, neofetch)
  | "cyan"
  | "violet"
  | "magenta"
  | "pink"
  | "cream"
  | "dark";

/** A colored run within a line (multi-color rows: whoami avatar + info). */
export type LineSegment = { text: string; tone?: LineTone };

/** One rendered row in the scrollback. */
export type Line = {
  text: string;
  tone?: LineTone;
  /** rare: a real link (used by `cat` on a project with a live URL) */
  href?: string;
  /**
   * Space-aligned output (neofetch, tree, tables) where wrapping would break
   * the columns. Rendered `white-space: pre` and allowed to scroll sideways,
   * like a real terminal, instead of reflowing.
   */
  mono?: boolean;
  /**
   * Multiple colored runs on one row (e.g. the whoami avatar column + profile
   * column). When present the renderer draws these instead of `text`; `text`
   * stays as the plain-text fallback for screen readers / aria-live.
   */
  segments?: LineSegment[];
  /**
   * An inline image block (the whoami avatar photo). The renderer draws it as
   * a small pixelated <img> floated beside the following text lines; `text` is
   * the alt/fallback. Used only where an actual asset beats ASCII.
   */
  image?: { src: string; alt: string };
  /** starts below a floated image (the whoami avatar) instead of beside it */
  clear?: boolean;
};

/** A completed command + its output, kept in scrollback. */
export type HistoryEntry = {
  id: number;
  /** The prompt path this ran under, e.g. "~" or "~/experience". */
  cwd: string;
  /** The raw command line the user submitted (echoed after the prompt). */
  input: string;
  /** Output lines. Empty for commands that print nothing (e.g. `cd`). */
  output: Line[];
};

/** A navigation request raised by `open`, performed by the Terminal component. */
export type NavRequest = { href: string; external: boolean };

/** Everything a command needs to run + how it can mutate shell state. */
export type CommandContext = {
  args: string[];
  /** raw argument string after the command name (for `echo`). */
  rest: string;
  /** current working directory as an absolute path array, e.g. ["home","vincent"] */
  cwd: string[];
  /** session command history (raw input strings), oldest first. */
  history: string[];
  /** mutate cwd (cd). */
  setCwd: (next: string[]) => void;
  /** wipe the scrollback (clear). */
  clear: () => void;
  /** request navigation (open) — Terminal routes internally or opens a tab. */
  navigate: (req: NavRequest) => void;
  /** enter the interactive timeline mode (timeline). */
  enterTimeline: () => void;
};

export type CommandResult = Line[];

export type Command = {
  name: string;
  summary: string;
  /** usage shown by `help` / `man`, optional. */
  usage?: string;
  run: (ctx: CommandContext) => CommandResult;
  /** completions for the current partial argument, optional. */
  complete?: (partial: string, ctx: CommandContext) => string[];
};
