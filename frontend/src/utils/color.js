// Choisit blanc ou texte foncé selon la luminance du fond, pour garder un
// contraste lisible peu importe la couleur configurée en base (statuts admin).
export function contrastText(hex) {
  if (!hex) return '#fff'
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#fff'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#111827' : '#fff'
}
