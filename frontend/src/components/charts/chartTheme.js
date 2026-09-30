/**
 * Valores de los tokens de Tailwind para Chart.js, que dibuja en canvas y no
 * lee clases. Mantener sincronizado con tailwind.config.js.
 */
export const chartColors = {
  brand: '#0369a1', // brand-700 (validado: contraste y croma para una serie)
  brandHover: '#075985', // brand-800
  grid: '#e2e8f0', // line
  axis: '#64748b', // ink-subtle
  ink: '#0f172a', // ink
};

export const chartFont = {
  family: '"IBM Plex Sans", system-ui, sans-serif',
  size: 12,
};

/** Tooltip sobrio: fondo oscuro, sin caja de color, cifras con la fuente del sistema. */
export const chartTooltip = {
  backgroundColor: chartColors.ink,
  titleFont: { ...chartFont, weight: '600' },
  bodyFont: chartFont,
  padding: 10,
  cornerRadius: 6,
  displayColors: false,
};
