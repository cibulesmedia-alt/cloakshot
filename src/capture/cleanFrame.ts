/**
 * Renders an optional sleek studio backdrop (padding + rounded corners + soft drop shadow)
 * around a captured screenshot canvas for ready-to-publish docs and social posts.
 */
export function applyCleanFrame(source: HTMLCanvasElement): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pad = Math.round(40 * dpr);
  const radius = Math.round(14 * dpr);

  const out = document.createElement('canvas');
  out.width = source.width + pad * 2;
  out.height = source.height + pad * 2;

  const ctx = out.getContext('2d');
  if (!ctx) return source;

  // Subtle modern dark-slate to deep-indigo studio backdrop
  const grad = ctx.createLinearGradient(0, 0, out.width, out.height);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e293b');
  grad.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, out.width, out.height);

  // Soft ambient glow behind the screenshot card
  const radial = ctx.createRadialGradient(
    out.width * 0.5,
    out.height * 0.3,
    Math.min(out.width, out.height) * 0.1,
    out.width * 0.5,
    out.height * 0.5,
    Math.max(out.width, out.height) * 0.75,
  );
  radial.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
  radial.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, out.width, out.height);

  // Draw rounded shadow container
  ctx.save();
  ctx.shadowColor = 'rgba(2, 6, 23, 0.55)';
  ctx.shadowBlur = Math.round(36 * dpr);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(16 * dpr);
  ctx.fillStyle = '#0f172a';
  drawRoundedRect(ctx, pad, pad, source.width, source.height, radius);
  ctx.fill();
  ctx.restore();

  // Clip rounded corners & draw screenshot
  ctx.save();
  drawRoundedRect(ctx, pad, pad, source.width, source.height, radius);
  ctx.clip();
  ctx.drawImage(source, pad, pad);
  ctx.restore();

  // Crisp subtle 1px border highlight
  ctx.save();
  drawRoundedRect(ctx, pad + 0.5, pad + 0.5, source.width - 1, source.height - 1, radius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  ctx.restore();

  return out;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
