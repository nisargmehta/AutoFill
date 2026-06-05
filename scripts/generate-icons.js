const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.join(__dirname, "..", "extension", "icons");
const sizes = [16, 32, 48, 128];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(filePath, width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }

  fs.writeFileSync(filePath, Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]));
}

function roundedRect(ctx, x, y, width, height, radius, color) {
  const r = Math.max(0, radius);
  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
      const dx = px < x + r ? x + r - px : px > x + width - r ? px - (x + width - r) : 0;
      const dy = py < y + r ? y + r - py : py > y + height - r ? py - (y + height - r) : 0;
      if (dx * dx + dy * dy <= r * r || (dx === 0 || dy === 0)) {
        setPixel(ctx, px, py, color);
      }
    }
  }
}

function line(ctx, x1, y1, x2, y2, width, color) {
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared));
      const projectionX = x1 + t * (x2 - x1);
      const projectionY = y1 + t * (y2 - y1);
      const distance = Math.hypot(x - projectionX, y - projectionY);
      if (distance <= width / 2) {
        setPixel(ctx, x, y, color);
      }
    }
  }
}

function setPixel(ctx, x, y, color) {
  if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) {
    return;
  }

  const index = (y * ctx.width + x) * 4;
  ctx.data[index] = color[0];
  ctx.data[index + 1] = color[1];
  ctx.data[index + 2] = color[2];
  ctx.data[index + 3] = color[3];
}

function downsample(source, targetSize, scale) {
  const target = Buffer.alloc(targetSize * targetSize * 4);
  const area = scale * scale;

  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const sourceIndex = (((y * scale) + sy) * source.width + ((x * scale) + sx)) * 4;
          sum[0] += source.data[sourceIndex];
          sum[1] += source.data[sourceIndex + 1];
          sum[2] += source.data[sourceIndex + 2];
          sum[3] += source.data[sourceIndex + 3];
        }
      }

      const targetIndex = (y * targetSize + x) * 4;
      target[targetIndex] = Math.round(sum[0] / area);
      target[targetIndex + 1] = Math.round(sum[1] / area);
      target[targetIndex + 2] = Math.round(sum[2] / area);
      target[targetIndex + 3] = Math.round(sum[3] / area);
    }
  }

  return target;
}

function drawIcon(size) {
  const scale = 4;
  const canvasSize = size * scale;
  const ctx = {
    width: canvasSize,
    height: canvasSize,
    data: Buffer.alloc(canvasSize * canvasSize * 4)
  };
  const s = canvasSize / 128;

  roundedRect(ctx, 0, 0, 128 * s, 128 * s, 24 * s, [23, 98, 173, 255]);
  roundedRect(ctx, 26 * s, 18 * s, 76 * s, 92 * s, 13 * s, [255, 255, 255, 255]);
  roundedRect(ctx, 41 * s, 40 * s, 48 * s, 10 * s, 5 * s, [23, 98, 173, 255]);
  roundedRect(ctx, 41 * s, 58 * s, 48 * s, 10 * s, 5 * s, [23, 98, 173, 255]);
  roundedRect(ctx, 41 * s, 76 * s, 30 * s, 10 * s, 5 * s, [23, 98, 173, 255]);
  line(ctx, 59 * s, 86 * s, 72 * s, 99 * s, 11 * s, [52, 199, 89, 255]);
  line(ctx, 71 * s, 98 * s, 98 * s, 69 * s, 11 * s, [52, 199, 89, 255]);

  return downsample(ctx, size, scale);
}

fs.mkdirSync(outDir, { recursive: true });
sizes.forEach((size) => {
  writePng(path.join(outDir, `easyfill-${size}.png`), size, size, drawIcon(size));
});
