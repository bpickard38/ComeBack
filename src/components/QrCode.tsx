import qrcode from 'qrcode-generator';

/**
 * A QR code for a link, drawn as an SVG so it stays sharp at any size.
 * Always dark squares on white, whatever the app's colors, because phone
 * cameras need that contrast. `label` is what a screen reader says instead.
 */
export function QrCode({ value, label, size = 148 }: { value: string; label: string; size?: number }) {
  const qr = qrcode(0, 'M'); // 0 picks the smallest size that fits; M tolerates some smudging
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 2; // blank border, in squares, so scanners can find the edges

  // One path of 1x1 squares is far lighter than hundreds of <rect>s.
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  const box = count + quiet * 2;

  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={box} height={box} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
