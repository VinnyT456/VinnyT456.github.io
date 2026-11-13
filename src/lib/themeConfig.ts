/**
 * Theme constants shared by the server (the no-flash <head> script in the root
 * layout) and the client (lib/theme.ts). No "use client" here on purpose: the
 * layout needs THEME_SCRIPT as a plain string, not a client reference.
 */
export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_KEY = "theme";
/** Routes with a finished light design. Add a route here when its page is done. */
export const LIGHT_READY: readonly string[] = ["/", "/about", "/contact", "/resume", "/experience", "/skills"];
/** Sections whose every page (the section itself and everything under it) has a finished light design. */
export const LIGHT_READY_SECTIONS: readonly string[] = ["/projects"];

// "/about/" and "/about" are the same page (static hosts serve both)
export const lightReady = (path: string) => {
  const p = path.replace(/(.)\/$/, "$1");
  return LIGHT_READY.includes(p) || LIGHT_READY_SECTIONS.some((s) => p === s || p.startsWith(s + "/"));
};

/** theme-color for the browser chrome, per theme */
export const THEME_COLOR: Record<Theme, string> = { dark: "#08080b", light: "#f7f6fb" };

/**
 * Runs inline in <head>, before the body paints: no flash of the wrong theme.
 * Mirrors resolve() in lib/theme.ts; keep the two in step.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_KEY
)});var q=location.pathname.replace(/(.)\\/$/,"$1");var ready=${JSON.stringify(LIGHT_READY)}.indexOf(q)>-1||${JSON.stringify(LIGHT_READY_SECTIONS)}.some(function(s){return q===s||q.indexOf(s+"/")===0});var sys=matchMedia("(prefers-color-scheme: light)").matches;var t=ready&&(p==="light"||((p===null||p==="system")&&sys))?"light":"dark";var d=document.documentElement;d.dataset.theme=t;d.classList.toggle("dark",t==="dark");d.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=${JSON.stringify(THEME_COLOR)}[t];}catch(e){}})();`;

