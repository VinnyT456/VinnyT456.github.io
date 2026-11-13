/** One exhibit's live repo numbers, from the API's /github/repos (keyed by exhibit slug). */
export type RepoStats = {
  name: string;
  url: string;
  stars: number;
  language: string | null;
  pushedAt: string;
  commits: number | null;
};

/** Stars only earn a mention once there are a few; "0 stars" says nothing useful. */
export const STAR_FLOOR = 5;
