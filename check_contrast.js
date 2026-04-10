const colors = {
  primary: '#1976d2',
  secondary: '#2e7d32',
  success: '#168539',
  warning: '#a86400',
  danger: '#c62828',
  info: '#0b6fa4',
  'neutral-700': '#344054',
  'neutral-900': '#1f2937'
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function getLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrast(hex1, hex2) {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return ((lighter + 0.05) / (darker + 0.05)).toFixed(2);
}

console.log('=== WCAG AA Contrast Ratios ===\n');
console.log('Target: 4.5:1 for text, 3:1 for UI components\n');

const white = '#ffffff';
const dark = '#000000';

Object.entries(colors).forEach(([name, hex]) => {
  const contrastWhite = getContrast(hex, white);
  const contrastDark = getContrast(hex, dark);
  const textPass = contrastWhite >= 4.5 ? '✓ PASS' : '✗ FAIL';
  const uiPass = contrastWhite >= 3 ? '✓ PASS' : '✗ FAIL';
  
  console.log(`${name.padEnd(15)} ${hex}`);
  console.log(`  On white: ${contrastWhite}:1 (text: ${textPass})`);
  console.log(`  On dark:  ${contrastDark}:1\n`);
});
