"use client";

import { useEffect, useState } from "react";

/**
 * The sky over Evanston, Illinois (Northwestern's campus), right now: from
 * Open-Meteo, which needs no key and is asked for nothing about the visitor.
 * The world shows it as it is: the sun or moon where it would be at this
 * hour there, rain or snow if it's falling, more cloud if it's cloudy.
 */

export const PLACE = { name: "Evanston, IL", lat: 42.05, lon: -87.68, tz: "America/Chicago" };

export type Weather = {
  /** °F */
  temp: number;
  code: number;
  isDay: boolean;
  /** 0 to 1 */
  cloud: number;
  /** what's falling, if anything */
  fall: "rain" | "snow" | null;
  /** mm in the last hour, a rough "how hard" */
  amount: number;
};

/** The sky's state, for the scene to read every frame (cloud cover, what's falling). */
export const SKY: { weather: Weather | null } = { weather: null };

const URL_ =
  `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}` +
  `&current=temperature_2m,is_day,weather_code,cloud_cover,precipitation&temperature_unit=fahrenheit&timezone=${encodeURIComponent(PLACE.tz)}`;
const FRESH_MS = 15 * 60 * 1000;
let cached: { at: number; w: Weather } | null = null;

/** WMO weather codes, as words. */
export function describe(code: number): string {
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "foggy";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return code >= 65 ? "heavy rain" : "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "showers";
  if (code === 85 || code === 86) return "snow showers";
  if (code >= 95) return "thunderstorm";
  return "";
}

function fallOf(code: number): Weather["fall"] {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  return null;
}

async function load(): Promise<Weather> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.w;
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(String(res.status));
  const c = (await res.json())?.current;
  if (typeof c?.temperature_2m !== "number" || typeof c?.weather_code !== "number") throw new Error("shape");
  const w: Weather = {
    temp: c.temperature_2m,
    code: c.weather_code,
    isDay: c.is_day === 1,
    cloud: Math.min(1, Math.max(0, (c.cloud_cover ?? 0) / 100)),
    fall: fallOf(c.weather_code),
    amount: typeof c.precipitation === "number" ? c.precipitation : 0,
  };
  cached = { at: Date.now(), w };
  return w;
}

/** The weather, or null while it's coming (or if it can't be had: then the sky just stays as it is). */
export function useWeather(): Weather | null {
  const [w, setW] = useState<Weather | null>(cached?.w ?? null);
  useEffect(() => {
    let alive = true;
    const get = () =>
      load()
        .then((x) => {
          if (!alive) return;
          SKY.weather = x;
          setW(x);
        })
        .catch(() => {});
    get();
    const id = window.setInterval(get, FRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
      SKY.weather = null;
    };
  }, []);
  return w;
}

/** The time there now, as hours (0–24) and as words ("9:41 PM"). */
export function localTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PLACE.tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const words = new Intl.DateTimeFormat("en-US", { timeZone: PLACE.tz, hour: "numeric", minute: "2-digit" }).format(now);
  return { hours: h + m / 60, words };
}
