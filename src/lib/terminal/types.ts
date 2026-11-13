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
  // a grep hit inside a line (like grep --color)
  | "match"
  // a removed line in a diff: coloured like an error, but it's output
  | "removed"
  // art tones — used only by colored ASCII (whoami avatar, neofetch)
  | "cyan"
  | "violet"
  | "magenta"
  | "pink"
  | "cream"
  | "dark";

/** A colored run within a line (multi-color rows: whoami avatar + info). */
export type LineSegment = {
  text: string;
  tone?: LineTone;
  /** a link on just this run (a project name in a list) */
  href?: string;
  /** clicking this run types and runs a command (a folder in `ls`, a name in `help`) */
  run?: string;
  /** [start, end) ranges inside `text` to mark, a grep hit (the run stays one link or button) */
  marks?: [number, number][];
};

/** One rendered row in the scrollback. */
export type Line = {
  text: string;
  tone?: LineTone;
  /** "err": a diagnostic (usage hint, refusal): printed, never sent down a pipe */
  stream?: "err";
  /** rare: a real link (used by `cat` on a project with a live URL) */
  href?: string;
  /**
   * Space-aligned output (neofetch, tree, tables) where wrapping would break
   * the columns. Rendered `white-space: pre` and allowed to scroll sideways,
   * like a real terminal, instead of reflowing.
   */
  mono?: boolean;
  /** printed without its trailing newline (echo -n): wc -c doesn't count one */
  noEol?: boolean;
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
  /** hanging indent in characters: wrapped text lines up under column N (label/value rows) */
  hang?: number;
  /**
   * Names laid out in columns, like `ls` on a terminal: the renderer fits as
   * many columns as the window allows. `text` stays the plain fallback.
   */
  cells?: LineSegment[];
  /** drawn art (a cow, a train, a meter): keeps its columns on every screen, never wraps */
  art?: boolean;
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
  /** printed by the shell itself (a nudge, a milestone): no prompt line above it */
  system?: boolean;
  /** the command failed (an error printed): the next prompt shows ✗ */
  failed?: boolean;
  /** a Tab completion listing: not a command, so the prompt's ✗ looks past it */
  listing?: boolean;
  /** shell output a screen reader should still hear (a role inspected from the timeline) */
  announce?: boolean;
  /** the line answered a [y/N] question: drawn without a prompt, kept out of history */
  answer?: boolean;
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
  /**
   * Hand the shell a network task (guestbook, stats, ask). The command's own
   * `run` output prints at once (e.g. "asking…"); when the task resolves, its
   * lines replace that output. Ctrl+C aborts it through `signal`. Absent where
   * there's no live shell (the boot whoami).
   */
  defer?: (task: (signal: AbortSignal) => Promise<Line[]>) => void;
  /** lines piped in from the command before `|` (absent when nothing is piped) */
  stdin?: Line[];
  /** stdout goes into a pipe, not the screen: print plain, one item per line (like `ls | …`) */
  piped?: boolean;
  /** open a full-window program (top, sl, cmatrix) that takes over the shell until it quits */
  launch?: (app: ShellApp) => void;
  /** set the exit status (0 is success): `grep` with no match, `false` */
  exit?: (code: number) => void;
  /** the directory before the last `cd` (for `cd -`) */
  oldCwd?: string[];
};

/** Full-window programs: they replace the prompt until they quit. */
export type ShellApp = { name: "top" } | { name: "sl" } | { name: "cmatrix" };

export type CommandResult = Line[];

export type Command = {
  name: string;
  summary: string;
  /** usage shown by `help` / `man`, optional. */
  usage?: string;
  run: (ctx: CommandContext) => CommandResult;
  /** completions for the current partial argument, optional. */
  complete?: (partial: string, ctx: CommandContext) => string[];
  /**
   * The short options it accepts (e.g. "n" for cat -n). When set, the shell
   * rejects any other -x / --long option before the command runs, like
   * coreutils. Commands that parse their own options leave it unset.
   */
  options?: string;
  /** handles its own --help (git's subcommand list) instead of the generic usage line */
  ownHelp?: boolean;
  /** options that are whole words (find's -name, -type): Tab completes these instead of single letters */
  flagWords?: string[];
};
