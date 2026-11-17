/**
 * Puts the theme and the saved scheme (the `scheme` cookie) on <html>: `.light`/`.dark` for the colors
 * and `data-scheme-pref` for the toggle icon, so both are right at first paint. app/layout.tsx inlines it into
 * <head> with toString() so it runs before first paint, so it must stay self-contained.
 */
export function applyScheme(theme?: string) {
  const root = document.documentElement;
  const saved = document.cookie.match(/(?:^|; )scheme=(light|dark)(?:;|$)/)?.[1];
  if (theme) root.dataset.theme = theme;
  root.classList.remove("light", "dark");
  if (saved) root.classList.add(saved);
  root.dataset.schemePref = saved ?? "system";
}
