import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/** Run git in this checkout; null when git or the history isn't there (a tarball, a sandbox). */
function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trimEnd();
  } catch {
    return null;
  }
}

/**
 * The repo as it stood at build time, for the About shell's `git`: real
 * commits, branches and working-tree state, so the shell never invents them.
 * Empty when git isn't available; the shell then says its log is a sketch.
 */
function gitSnapshot(): string {
  // %D: the refs pointing at each commit (HEAD -> main, origin/main…), for log's decorations
  const log = git("log -50 --date=default --format=%h%x1f%H%x1f%an%x1f%ae%x1f%ad%x1f%s%x1f%p%x1f%D");
  if (!log) return "";
  const head = git("status --porcelain=v1 -b") ?? "";
  const [branchLine = "", ...changes] = head.split("\n");
  // "## main...origin/main [ahead 1, behind 2]"
  const m = branchLine.match(/^## (\S+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/);
  return JSON.stringify({
    branch: m?.[1] ?? "main",
    upstream: m?.[2] ?? null,
    track: m?.[3] ?? null,
    changes: changes.filter(Boolean),
    // the format is quoted: ( ) are shell syntax
    branches: (git("for-each-ref '--format=%(refname:short)' refs/heads") ?? "").split("\n").filter(Boolean),
    remoteBranches: (git("for-each-ref '--format=%(refname)' refs/remotes") ?? "")
      .split("\n")
      .filter((b) => b && !b.endsWith("/HEAD"))
      .map((b) => b.replace(/^refs\/remotes\//, "")),
    remotes: (git("remote -v") ?? "").split("\n").filter(Boolean),
    version: git("--version") ?? "",
    shortstat: git("diff --shortstat HEAD") ?? "",
    stat: git("diff --stat=80 HEAD") ?? "",
    log: log.split("\n").map((l) => {
      const [hash, full, name, email, date, subject, parents, refs] = l.split("\x1f");
      return { hash, full, name, email, date, subject, merge: parents.includes(" "), refs };
    }),
  });
}

const nextConfig: NextConfig = {
  // Pin project root — a stray package-lock.json in a parent dir confuses detection.
  turbopack: {
    root: __dirname,
  },
  // the dev-only Next badge sat on top of the phone dock's first item
  devIndicators: false,
  env: {
    GIT_SNAPSHOT: gitSnapshot(),
  },
};

export default nextConfig;
