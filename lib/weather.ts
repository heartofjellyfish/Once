/**
 * OpenWeatherMap current-weather wrapper. Free tier: 60 calls/min +
 * 1M calls/month. More than enough for 2 cron cycles/day × ~20 cities.
 *
 * Returns a short label like "Cloudy, 18°C" ready to stick on the
 * envelope / page. Rounded Celsius, short weather word.
 *
 * Falls back to `null` on any error — weather is a nice-to-have, not
 * a blocker.
 */

interface WeatherResponse {
  weather?: { main?: string; description?: string }[];
  main?: { temp?: number };
}

export async function fetchWeatherLabel(
  lat: number,
  lng: number
): Promise<string | null> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return null;

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("units", "metric");
  url.searchParams.set("appid", key);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as WeatherResponse;

    const main = data.weather?.[0]?.main;
    const temp = data.main?.temp;
    if (!main || typeof temp !== "number") return null;

    return `${main}, ${Math.round(temp)}°C`;
  } catch {
    return null;
  }
}
