import { Hono } from "hono";
import knowledge from "./knowledge.json" with { type: "json" };

/**
 * Everything the site shows from my GitHub, behind one cache each:
 *
 *   GET /github                 latest public push        ("currently: …")  10 min
 *   GET /github/contributions   the year's contribution calendar (heatmap)  1 h
 *   GET /github/repos           per-exhibit repo stats (plaques, rooms)      1 h
 *
 * The events and repo endpoints work without a token (60 requests/hour, which
 * the caches stay well under). The contribution calendar is GraphQL-only, and
 * GraphQL always needs a token: GITHUB_TOKEN, a classic token with no scopes.
 */

const USER = process.env.GITHUB_USER ?? "VinnyT456";
const TOKEN = process.env.GITHUB_TOKEN;

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "portfolio-api",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

function gh(path: string) {
  return fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(10_000) });
}

/** One cached value with stale-on-error: a failed refresh serves the last good answer. */
function cached<T>(ttlMs: number, load: () => Promise<T>) {
  let entry: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  return async (): Promise<{ value: T; stale: boolean } | null> => {
    if (entry && Date.now() - entry.at < ttlMs) return { value: entry.value, stale: false };
    try {
      // concurrent visitors share one refresh
      inflight ??= load().finally(() => {
        inflight = null;
      });
      const value = await inflight;
      entry = { at: Date.now(), value };
      return { value, stale: false };
    } catch (err) {
      console.error("[github]", err instanceof Error ? err.message : "unknown");
      return entry ? { value: entry.value, stale: true } : null;
    }
  };
}

// ---- latest push ------------------------------------------------------------

type Activity = { repo: string; url: string; at: string } | { repo: null };

const activity = cached<Activity>(10 * 60_000, async () => {
  const res = await gh(`/users/${USER}/events/public?per_page=30`);
  if (!res.ok) throw new Error(`events ${res.status}`);
  const events = (await res.json()) as { type: string; created_at: string; repo: { name: string } }[];
  const push = events.find((e) => e.type === "PushEvent");
  if (!push) return { repo: null };
  return {
    // "owner/name" → "name": it's always my repo
    repo: push.repo.name.split("/").pop() ?? push.repo.name,
    url: `https://github.com/${push.repo.name}`,
    at: push.created_at,
  };
});

// ---- contribution calendar ------------------------------------------------

/** [date, count, level 0–4] per day, weeks Sunday-first like GitHub's own grid. */
type Calendar = { total: number; weeks: [string, number, number][][] };

const LEVEL: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const calendar = cached<Calendar>(60 * 60_000, async () => {
  if (!TOKEN) throw new Error("contributions need GITHUB_TOKEN");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($login: String!) {
        user(login: $login) {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks { contributionDays { date contributionCount contributionLevel } }
            }
          }
        }
      }`,
      variables: { login: USER },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`graphql ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      user?: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: number;
            weeks: {
              contributionDays: { date: string; contributionCount: number; contributionLevel: string }[];
            }[];
          };
        };
      };
    };
  };
  const cal = json.data?.user?.contributionsCollection.contributionCalendar;
  if (!cal) throw new Error("graphql: no calendar");
  return {
    total: cal.totalContributions,
    weeks: cal.weeks.map((w) =>
      w.contributionDays.map(
        (d) => [d.date, d.contributionCount, LEVEL[d.contributionLevel] ?? 0] as [string, number, number]
      )
    ),
  };
});

// ---- per-exhibit repo stats -------------------------------------------------

type RepoStats = {
  name: string;
  url: string;
  stars: number;
  language: string | null;
  pushedAt: string;
  commits: number | null;
};

// exhibit slug → repo name, from the site's own data (npm run knowledge)
const EXHIBIT_REPOS = knowledge.projects
  .filter((p): p is typeof p & { repo: string } => typeof (p as { repo?: unknown }).repo === "string")
  .map((p) => ({ slug: p.slug, repo: p.repo }));

/** Commits on the default branch: ask for 1 per page, read the last page number. */
async function commitCount(repo: string): Promise<number | null> {
  const res = await gh(`/repos/${USER}/${repo}/commits?per_page=1`);
  if (!res.ok) return null;
  const last = res.headers.get("link")?.match(/[?&]page=(\d+)>; rel="last"/);
  if (last) return Number(last[1]);
  return ((await res.json()) as unknown[]).length; // 0 or 1 commit: no pagination
}

const repos = cached<Record<string, RepoStats>>(60 * 60_000, async () => {
  const res = await gh(`/users/${USER}/repos?per_page=100&type=owner`);
  if (!res.ok) throw new Error(`repos ${res.status}`);
  const list = (await res.json()) as {
    name: string;
    html_url: string;
    stargazers_count: number;
    language: string | null;
    pushed_at: string;
  }[];
  const byName = new Map(list.map((r) => [r.name.toLowerCase(), r]));
  const out: Record<string, RepoStats> = {};
  await Promise.all(
    EXHIBIT_REPOS.map(async ({ slug, repo }) => {
      const r = byName.get(repo.toLowerCase());
      if (!r) return; // private or renamed: no stats rather than wrong ones
      out[slug] = {
        name: r.name,
        url: r.html_url,
        stars: r.stargazers_count,
        language: r.language,
        pushedAt: r.pushed_at,
        commits: await commitCount(r.name),
      };
    })
  );
  return out;
});

// ---- routes -----------------------------------------------------------------

export const github = new Hono();

github.get("/", async (c) => {
  const r = await activity();
  // the site hides the row on 503
  return r ? c.json(r.value) : c.json({ repo: null } satisfies Activity, 503);
});

github.get("/contributions", async (c) => {
  const r = await calendar();
  return r ? c.json(r.value) : c.json({ ok: false, error: "Contributions unavailable." }, 503);
});

github.get("/repos", async (c) => {
  const r = await repos();
  return r ? c.json({ repos: r.value }) : c.json({ ok: false, error: "Repo stats unavailable." }, 503);
});
