/** Public asset path that respects Vite base (e.g. /paper-kit/ on GitHub Pages). */
export function assetUrl(path: string): string {
  const normalized = path.replace(/^\//, '')
  return `${import.meta.env.BASE_URL}${normalized}`
}
