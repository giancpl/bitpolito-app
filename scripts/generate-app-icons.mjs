// Rasterize the existing vector brand asset; no generated or replacement logo.
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const source = await readFile(
  new URL("../public/brand/cow-icon-white.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await mkdir(new URL("../public/icons/", import.meta.url), {
    recursive: true,
  });
  for (const [filename, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ]) {
    const png = await page.evaluate(
      async ({ source, size }) => {
        const img = new Image();
        img.src = `data:image/svg+xml;base64,${btoa(source)}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
        context.fillStyle = "#001ce0";
        context.fillRect(0, 0, size, size);
        // Keep the cow inside the central maskable safe zone on every icon.
        const width = size * 0.6,
          height = width * (1260 / 1540);
        context.drawImage(
          img,
          (size - width) / 2,
          (size - height) / 2,
          width,
          height,
        );
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { source, size },
    );
    await writeFile(
      new URL(`../public/icons/${filename}`, import.meta.url),
      Buffer.from(png, "base64"),
    );
  }
} finally {
  await browser.close();
}
