// Today's sky (`TodaySky` in OverviewPage.tsx): where the sun or the moon stands, worked out on this device from its
// clock and time zone alone. No location is asked for: the zone's main city stands in for where the person is.
import { daypartAt } from "./dates.ts";

/** Latitude and longitude of each zone's city, for the zones Atlaswork's people (EU first) most likely use. */
const cities: Record<string, [number, number]> = {
  "Europe/Lisbon": [38.7, -9.1], "Atlantic/Madeira": [32.6, -16.9], "Atlantic/Azores": [37.7, -25.7],
  "Europe/Madrid": [40.4, -3.7], "Atlantic/Canary": [28.1, -15.4], "Europe/London": [51.5, -0.1],
  "Europe/Dublin": [53.3, -6.3], "Europe/Paris": [48.9, 2.4], "Europe/Brussels": [50.8, 4.4],
  "Europe/Amsterdam": [52.4, 4.9], "Europe/Luxembourg": [49.6, 6.1], "Europe/Berlin": [52.5, 13.4],
  "Europe/Zurich": [47.4, 8.5], "Europe/Vienna": [48.2, 16.4], "Europe/Rome": [41.9, 12.5],
  "Europe/Copenhagen": [55.7, 12.6], "Europe/Stockholm": [59.3, 18.1], "Europe/Oslo": [59.9, 10.8],
  "Europe/Helsinki": [60.2, 24.9], "Europe/Warsaw": [52.2, 21], "Europe/Prague": [50.1, 14.4],
  "Europe/Budapest": [47.5, 19], "Europe/Athens": [38, 23.7], "Europe/Bucharest": [44.4, 26.1],
  "Europe/Sofia": [42.7, 23.3], "Europe/Zagreb": [45.8, 16], "Europe/Ljubljana": [46.1, 14.5],
  "Europe/Bratislava": [48.1, 17.1], "Europe/Tallinn": [59.4, 24.7], "Europe/Riga": [56.9, 24.1],
  "Europe/Vilnius": [54.7, 25.3], "Europe/Malta": [35.9, 14.5], "Asia/Nicosia": [35.2, 33.4],
  "America/New_York": [40.7, -74], "America/Chicago": [41.9, -87.6], "America/Denver": [39.7, -105],
  "America/Los_Angeles": [34.1, -118.2], "America/Sao_Paulo": [-23.5, -46.6], "Australia/Sydney": [-33.9, 151.2],
  "Asia/Tokyo": [35.7, 139.7], "Asia/Kolkata": [22.6, 88.4],
};
const southern = /^(Australia|Antarctica|Pacific\/(Auckland|Chatham|Fiji|Noumea)|America\/(Argentina|Sao_Paulo|Santiago|Montevideo|Asuncion|La_Paz|Lima)|Africa\/(Johannesburg|Maputo|Harare|Windhoek|Lusaka|Gaborone|Maseru)|Indian\/(Mauritius|Reunion))/;

/** A zone without a city above: its hemisphere's middle latitudes, on the meridian of its standard offset. */
export function placeOf(zone: string, standardOffsetMinutes: number) {
  const [lat, lon] = cities[zone] ?? [southern.test(zone) ? -30 : 40, standardOffsetMinutes / 4];
  return { lat, lon };
}

const rad = Math.PI / 180;

/**
 * Sunrise and sunset on `date`'s day as hours on the local clock (NOAA's low-precision formulas, refraction included,
 * within a few minutes of almanac times). Polar night gives no daylight (`rise === set`), midnight sun all of it.
 */
export function sunTimes(date: Date, lat: number, lon: number, offsetMinutes: number) {
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5);
  const g = (2 * Math.PI / 365) * (day - 1);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const declination = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHour = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(declination)) - Math.tan(lat * rad) * Math.tan(declination);
  const noon = (720 - 4 * lon - equation + offsetMinutes) / 60;
  if (cosHour > 1) return { rise: noon, set: noon };
  if (cosHour < -1) return { rise: 0, set: 24 };
  const half = Math.acos(cosHour) / rad / 15;
  return { rise: noon - half, set: noon + half };
}

/** How far through its cycle the moon is: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(date: Date) {
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5;
  return (((days / 29.530588853) % 1) + 1) % 1;
}

/** The sky at `now`: high sun, a low warm one within the hour of rising or setting, or night; `share` is how far along its arc the sun or moon is. */
export type Sky = { state: "day" | "low" | "night"; share: number; phase: number; south: boolean };

export function skyAt(now: Date, daypart: string, zone = Intl.DateTimeFormat().resolvedOptions().timeZone): Sky {
  const year = now.getFullYear();
  const standard = -Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
  const { lat, lon } = placeOf(zone, standard);
  const { rise, set } = sunTimes(now, lat, lon, -now.getTimezoneOffset());
  const light = set - rise;
  const clock = now.getHours() + now.getMinutes() / 60;
  // A pinned daypart (`?daypart=`) shows that part of today's daylight: mid-morning, early afternoon, the last of the
  // light, the middle of the night.
  const pinned: Record<string, number> = { morning: rise + light * 0.22, day: rise + light * 0.55, evening: set - 0.4, night: ((set + 24 + rise) / 2) % 24 };
  const hour = daypartAt(now.getHours()) === daypart ? clock : pinned[daypart] ?? clock;
  const night = light <= 0 || (light < 24 && (hour < rise || hour >= set));
  const share = night ? ((hour - set + 24) % 24) / (24 - light) : light >= 24 ? hour / 24 : (hour - rise) / light;
  const low = !night && light < 24 && (hour - rise < 0.75 || set - hour < 1.25);
  return { state: night ? "night" : low ? "low" : "day", share, phase: moonPhase(now), south: lat < 0 };
}
