const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('usage: node prepare-pet-image.js input output');

async function run() {
  const { data, info } = await sharp(input)
    .extract({ left: 145, top: 30, width: 900, height: 1163 })
    .resize({ width: 620, height: 800, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const total = width * height;
  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const isGreenBackground = index => {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    return g > r * 1.08 && g > b * 1.12 && g > 38;
  };
  const seed = index => {
    if (!background[index] && isGreenBackground(index)) {
      background[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) seed(index - 1);
    if (x + 1 < width) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y + 1 < height) seed(index + width);
  }
  for (let i = 0; i < total; i++) if (background[i]) data[i * 4 + 3] = 0;
  await sharp(data, { raw: info }).png().toFile(output);
}
run().catch(error => { console.error(error); process.exit(1); });
