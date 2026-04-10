// Find replacement colors that meet WCAG AA 4.5:1 contrast on white

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join('');
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

// Target contrast: 4.5:1
// Current failing colors:
// success: #1b8a3e (4.42:1) - needs darkening
// warning: #b26a00 (4.24:1) - needs darkening

console.log('=== Finding WCAG AA Compliant Colors ===\n');
console.log('Testing darkened versions:\n');

// Test success color variations
console.log('SUCCESS COLOR:');
const successBase = '#1b8a3e';
for (let i = 0; i <= 3; i++) {
  const darkened = hexToRgb(successBase);
  darkened.r = Math.max(0, darkened.r - (i * 5));
  darkened.g = Math.max(0, darkened.g - (i * 5));
  darkened.b = Math.max(0, darkened.b - (i * 5));
  const hex = rgbToHex(darkened.r, darkened.g, darkened.b);
  const contrast = getContrast(hex, '#ffffff');
  const pass = contrast >= 4.5 ? '✓' : '✗';
  console.log(`  ${hex} → ${contrast}:1 ${pass}`);
}

console.log('\nWARNING COLOR:');
const warningBase = '#b26a00';
for (let i = 0; i <= 5; i++) {
  const darkened = hexToRgb(warningBase);
  darkened.r = Math.max(0, darkened.r - (i * 5));
  darkened.g = Math.max(0, darkened.g - (i * 3));
  darkened.b = Math.max(0, darkened.b - (i * 2));
  const hex = rgbToHex(darkened.r, darkened.g, darkened.b);
  const contrast = getContrast(hex, '#ffffff');
  const pass = contrast >= 4.5 ? '✓' : '✗';
  console.log(`  ${hex} → ${contrast}:1 ${pass}`);
}
