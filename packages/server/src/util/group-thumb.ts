import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const THUMB_DIR = join(__dirname, "../../data/group-thumbs");
const SIZE = 32;
const MAX_SLICES = 3;

/** Ensure the cache directory exists. */
function ensureDir(): void {
  if (!existsSync(THUMB_DIR)) mkdirSync(THUMB_DIR, { recursive: true });
}

/**
 * Generate a composite thumbnail from center-cropped vertical slices.
 * Uses up to the first 3 thumbnails. Saves to data/group-thumbs/{groupId}.webp.
 */
export async function generateGroupThumb(
  groupId: number,
  thumbnailUrls: string[],
  prefix: "mouse" | "item" = "mouse",
): Promise<string | null> {
  const urls = thumbnailUrls.filter(Boolean).slice(0, MAX_SLICES);
  if (urls.length === 0) return null;

  ensureDir();
  const outPath = join(THUMB_DIR, `${prefix}_${groupId}.webp`);

  // Fetch all thumbnails in parallel
  const buffers: Buffer[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) buffers.push(Buffer.from(await res.arrayBuffer()));
    } catch {
      /* skip failed fetches */
    }
  }
  if (buffers.length === 0) return null;

  const n = buffers.length;

  // Calculate slice widths: distribute SIZE pixels across N slices
  const baseW = Math.floor(SIZE / n);
  const sliceWidths = Array.from({ length: n }, (_, i) =>
    i === n - 1 ? SIZE - baseW * (n - 1) : baseW
  );

  // Extract center-cropped vertical slices
  const slices = await Promise.all(
    buffers.map(async (buf, i) => {
      const w = sliceWidths[i];
      const centerLeft = Math.floor((SIZE - w) / 2);
      return sharp(buf)
        .resize(SIZE, SIZE, { fit: "cover" })
        .extract({ left: centerLeft, top: 0, width: w, height: SIZE })
        .toBuffer();
    })
  );

  // Calculate left positions for compositing
  const lefts: number[] = [];
  let x = 0;
  for (const w of sliceWidths) {
    lefts.push(x);
    x += w;
  }

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      slices.map((buf, i) => ({
        input: buf,
        left: lefts[i],
        top: 0,
      }))
    )
    .webp({ quality: 80 })
    .toFile(outPath);

  return outPath;
}

/**
 * Get group thumb as a data URL. Returns null if not cached on disk.
 */
export function getGroupThumbDataUrl(groupId: number, prefix: "mouse" | "item" = "mouse"): string | null {
  // Check prefixed path first; fall back to legacy unprefixed path for existing mouse thumbs
  let path = join(THUMB_DIR, `${prefix}_${groupId}.webp`);
  if (!existsSync(path)) {
    const legacyPath = join(THUMB_DIR, `${groupId}.webp`);
    if (prefix === "mouse" && existsSync(legacyPath)) {
      path = legacyPath;
    } else {
      return null;
    }
  }
  const buf = readFileSync(path);
  return `data:image/webp;base64,${buf.toString("base64")}`;
}
