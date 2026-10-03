import type { ComponentType } from "react";
// Per-icon imports: the package root is a CommonJS barrel of ~1,900 icons
// that bundlers can't tree-shake (it pulled 3MB gz into /skills).
import PythonOriginal from "devicons-react/icons/PythonOriginal";
import TypescriptOriginal from "devicons-react/icons/TypescriptOriginal";
import JavaOriginal from "devicons-react/icons/JavaOriginal";
import CplusplusOriginal from "devicons-react/icons/CplusplusOriginal";
import ReactOriginal from "devicons-react/icons/ReactOriginal";
import NextjsOriginal from "devicons-react/icons/NextjsOriginal";
import TailwindcssOriginal from "devicons-react/icons/TailwindcssOriginal";
import ThreejsOriginal from "devicons-react/icons/ThreejsOriginal";
import VitejsOriginal from "devicons-react/icons/VitejsOriginal";
import FastapiOriginal from "devicons-react/icons/FastapiOriginal";
import SupabaseOriginal from "devicons-react/icons/SupabaseOriginal";
import PostgresqlOriginal from "devicons-react/icons/PostgresqlOriginal";
import DockerOriginal from "devicons-react/icons/DockerOriginal";
import PytorchOriginal from "devicons-react/icons/PytorchOriginal";
import ScikitlearnOriginal from "devicons-react/icons/ScikitlearnOriginal";
import OpencvOriginal from "devicons-react/icons/OpencvOriginal";
import NumpyOriginal from "devicons-react/icons/NumpyOriginal";
import PandasOriginal from "devicons-react/icons/PandasOriginal";
import MatplotlibOriginal from "devicons-react/icons/MatplotlibOriginal";
import QtOriginal from "devicons-react/icons/QtOriginal";
import StreamlitOriginal from "devicons-react/icons/StreamlitOriginal";
import SeleniumOriginal from "devicons-react/icons/SeleniumOriginal";
import VitestOriginal from "devicons-react/icons/VitestOriginal";
import JunitOriginal from "devicons-react/icons/JunitOriginal";
import CucumberPlain from "devicons-react/icons/CucumberPlain";
import GitOriginal from "devicons-react/icons/GitOriginal";
import VercelOriginal from "devicons-react/icons/VercelOriginal";

type IconProps = { size?: number | string; className?: string };
type IconType = ComponentType<IconProps>;

/**
 * id → real, multi-colour brand logo (devicons "Original" variants render each
 * logo in its own colours — Python blue+yellow, Java orange+white, etc). The
 * SVGs colour themselves, so the tile CSS no longer tints them. Adding a tool
 * is: data entry + one line here.
 */
export const skillIcons: Record<string, IconType> = {
  python: PythonOriginal,
  typescript: TypescriptOriginal,
  java: JavaOriginal,
  cpp: CplusplusOriginal,
  react: ReactOriginal,
  nextjs: NextjsOriginal,
  tailwindcss: TailwindcssOriginal,
  threejs: ThreejsOriginal,
  vite: VitejsOriginal,
  fastapi: FastapiOriginal,
  supabase: SupabaseOriginal,
  postgresql: PostgresqlOriginal,
  docker: DockerOriginal,
  pytorch: PytorchOriginal,
  "scikit-learn": ScikitlearnOriginal,
  opencv: OpencvOriginal,
  numpy: NumpyOriginal,
  pandas: PandasOriginal,
  matplotlib: MatplotlibOriginal,
  pyqt: QtOriginal,
  streamlit: StreamlitOriginal,
  selenium: SeleniumOriginal,
  vitest: VitestOriginal,
  junit: JunitOriginal,
  cucumber: CucumberPlain,
  git: GitOriginal,
  vercel: VercelOriginal,
};

/** Gemini's four-point mark — no devicon exists for it, so it's drawn here. */
function GeminiMark({ size = 28 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <defs>
        <linearGradient id="gemini-mark" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gemini-mark)"
        d="M12 2c.5 5.3 4.7 9.5 10 10-5.3.5-9.5 4.7-10 10-.5-5.3-4.7-9.5-10-10 5.3-.5 9.5-4.7 10-10z"
      />
    </svg>
  );
}
skillIcons.gemini = GeminiMark;

/** Tools with no logo at all get a short typeset label in their brand colour
 *  instead of a guessed mark. */
export const skillGlyphs: Record<string, string> = {
  tesseract: "OCR",
};

/** Logos drawn in solid black — flipped to light so they read on the dark
 *  cabinet instead of disappearing into it. */
export const invertedIcons = new Set(["threejs", "vercel"]);

/** Dark-but-coloured logos — brightened rather than inverted. */
export const liftedIcons = new Set(["pandas"]);
