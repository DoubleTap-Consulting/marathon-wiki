// Rendered once on the server in the site's fixed zone, so first paint and hydration show the same
// text. The exact time is in the title and the datetime attribute.
const SITE_TIME_ZONE = "America/Chicago";
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: SITE_TIME_ZONE });
const exact = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "long", timeZone: SITE_TIME_ZONE });

export function SiteDate({ iso }: { iso: string }) {
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={exact.format(date)}>
      {day.format(date)}
    </time>
  );
}
