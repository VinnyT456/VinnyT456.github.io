"use client";

import { useEffect, useState } from "react";
import { api, hasApi } from "@/lib/api";
import type { RepoStats } from "@/lib/repos";

/**
 * Small read-only views of the API for the home page's live section: exhibit
 * view counts, per-exhibit repo stats, and the latest push. Each is fetched at
 * most once per page load (a failure isn't cached, so a later mount retries)
 * and every caller treats "nothing yet" as "show nothing", never an error.
 */

function shared<T>(path: string) {
  let pending: Promise<T> | null = null;
  const load = () =>
    (pending ??= api<T>(path, { timeoutMs: 75_000 }).catch((err) => {
      pending = null;
      throw err;
    }));
  return function useShared(): T | null {
    const [value, setValue] = useState<T | null>(null);
    useEffect(() => {
      if (!hasApi) return;
      let alive = true;
      load()
        .then((v) => alive && setValue(v))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []);
    return value;
  };
}

export const useViews = shared<{ counts: Record<string, number> }>("/views");
export const useRepos = shared<{ repos: Record<string, RepoStats> }>("/github/repos");
export const useLastPush = shared<{ repo: string; url: string; at: string } | { repo: null }>("/github");
