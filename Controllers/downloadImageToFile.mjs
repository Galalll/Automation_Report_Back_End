import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { URL } from 'url';

export async function downloadImageToFile(imageUrl, outDir = 'TmpImages') {
  // 1) Fetch the URL
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status} ${res.statusText}`);
  }

  // 2) Read as ArrayBuffer → Buffer
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 3) Determine a file name & extension
  const urlObj = new URL(imageUrl);
  const ext = path.extname(urlObj.pathname) || '.jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  // 4) Ensure output directory exists (optional)
  await fs.mkdir(outDir, { recursive: true });

  // 5) Write to disk
  const filePath = path.join(outDir, filename);
  await fs.writeFile(filePath, buffer);

  // 6) Return the path
  return filePath;
}

