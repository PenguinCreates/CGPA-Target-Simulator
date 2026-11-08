/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#1c293e',
    tint: '#1959bc',
    background: '#edf4fa',
    foreground: '#1c293e',
    card: '#fcfdfe',
    cardForeground: '#1c293e',
    primary: '#1959bc',
    primaryForeground: '#ffffff',
    secondary: '#dce8f3',
    secondaryForeground: '#23334b',
    muted: '#e8f0f6',
    mutedForeground: '#596d87',
    accent: '#a1dcf0',
    accentForeground: '#1d3444',
    destructive: '#c34a40',
    destructiveForeground: '#ffffff',
    border: '#d2dce8',
    input: '#c5d1df',
    success: '#26704b',
    successSurface: '#e8f4eb',
    warning: '#986310',
    warningSurface: '#fff2d7',
    dangerSurface: '#fae9e6',
    chartTarget: '#d39b37',
  },
  dark: {
    text: '#e3e9f1',
    tint: '#5794ed',
    background: '#101a28',
    foreground: '#e3e9f1',
    card: '#192536',
    cardForeground: '#e3e9f1',
    primary: '#5794ed',
    primaryForeground: '#ffffff',
    secondary: '#29384c',
    secondaryForeground: '#e3e9f1',
    muted: '#28364a',
    mutedForeground: '#a0b0c5',
    accent: '#2d728e',
    accentForeground: '#e5f2f7',
    destructive: '#d96559',
    destructiveForeground: '#ffffff',
    border: '#34445a',
    input: '#40516a',
    success: '#a5e1ba',
    successSurface: '#233d32',
    warning: '#f3d18b',
    warningSurface: '#43381f',
    dangerSurface: '#472d2b',
    chartTarget: '#e0b55a',
  },
  radius: 14,
};

export default colors;
