import jpeg from "jpeg-js";
import { decode as decodePng, convertIndexedToRgb } from "fast-png";

export function resizeScreenshot(
  bytes: Uint8Array,
  targetWidth: number,
): Uint8Array {
  let width: number, height: number, pixels: Uint8Array;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const header = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    if (header.getUint32(16) * header.getUint32(20) > 8_000_000)
      throw new Error("Screenshot dimensions exceed resize limit");
    const png = decodePng(bytes);
    width = png.width;
    height = png.height;
    const data = png.palette ? convertIndexedToRgb(png) : png.data;
    const channels = png.palette
      ? data.length / (width * height)
      : png.channels;
    const scale = png.palette ? 1 : 255 / (2 ** png.depth - 1);
    pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const alpha =
        channels === 2 || channels === 4
          ? (data[i * channels + channels - 1] * scale) / 255
          : 1;
      for (let c = 0; c < 3; c++)
        pixels[i * 4 + c] = Math.round(
          data[i * channels + (channels <= 2 ? 0 : c)] * scale * alpha +
            255 * (1 - alpha),
        );
      pixels[i * 4 + 3] = 255;
    }
  } else {
    const decoded = jpeg.decode(bytes, {
      useTArray: true,
      maxResolutionInMP: 8,
      maxMemoryUsageInMB: 64,
    });
    width = decoded.width;
    height = decoded.height;
    pixels = decoded.data;
  }
  const w = Math.min(width, targetWidth),
    h = Math.max(1, Math.round((height * w) / width));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(
          width - 1,
          Math.max(0, ((x + 0.5) * width) / w - 0.5),
        ),
        sy = Math.min(height - 1, Math.max(0, ((y + 0.5) * height) / h - 0.5));
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1),
        dx = sx - x0,
        dy = sy - y0;
      for (let c = 0; c < 3; c++)
        data[(y * w + x) * 4 + c] =
          (pixels[(y0 * width + x0) * 4 + c] * (1 - dx) +
            pixels[(y0 * width + x1) * 4 + c] * dx) *
            (1 - dy) +
          (pixels[(y1 * width + x0) * 4 + c] * (1 - dx) +
            pixels[(y1 * width + x1) * 4 + c] * dx) *
            dy;
      data[(y * w + x) * 4 + 3] = 255;
    }
  return new Uint8Array(jpeg.encode({ width: w, height: h, data }, 80).data);
}
