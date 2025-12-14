/**
 * Enrichment script to add publishedAt dates to existing caption files.
 * Uses yt-dlp to fetch upload dates from YouTube.
 *
 * AIDEV-NOTE: Run with: bun run scripts/enrich-publish-dates.ts
 * Requires: yt-dlp installed (brew install yt-dlp)
 */

import { Glob, $ } from "bun";
import { join } from "node:path";
import pLimit from "p-limit";

const CAPTIONS_DIR = join(import.meta.dir, "../data/captions");
const CONCURRENCY_LIMIT = 5;

interface VideoData {
  video: {
    id: string;
    title: string;
    url: string;
    duration: number;
    playlistId: string;
    playlistTitle: string;
  };
  captions: unknown[];
  fetchedAt: string;
  publishedAt?: string;
}

async function getPublishDate(videoId: string): Promise<string | null> {
  try {
    // yt-dlp outputs upload_date as YYYYMMDD
    const result = await $`yt-dlp --print upload_date --skip-download --no-warnings https://youtu.be/${videoId}`.text();
    const dateStr = result.trim();

    if (dateStr && /^\d{8}$/.test(dateStr)) {
      // Convert YYYYMMDD to ISO date string
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      return `${year}-${month}-${day}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Enriching Caption Files with Publish Dates ===\n");

  const glob = new Glob("*.json");
  const files: string[] = [];

  for await (const file of glob.scan(CAPTIONS_DIR)) {
    files.push(file);
  }

  console.log(`Found ${files.length} caption files`);

  // Check which files need enrichment
  const needsEnrichment: { file: string; data: VideoData }[] = [];

  for (const file of files) {
    const filePath = join(CAPTIONS_DIR, file);
    const data: VideoData = await Bun.file(filePath).json();

    if (!data.publishedAt) {
      needsEnrichment.push({ file, data });
    }
  }

  console.log(`Files needing enrichment: ${needsEnrichment.length}`);

  if (needsEnrichment.length === 0) {
    console.log("\nAll files already have publish dates!");
    return;
  }

  const limit = pLimit(CONCURRENCY_LIMIT);
  let completed = 0;
  let success = 0;
  let failed = 0;

  const tasks = needsEnrichment.map(({ file, data }) =>
    limit(async () => {
      const publishDate = await getPublishDate(data.video.id);
      completed++;

      if (publishDate) {
        data.publishedAt = publishDate;
        const filePath = join(CAPTIONS_DIR, file);
        await Bun.write(filePath, JSON.stringify(data, null, 2));
        success++;
        console.log(
          `[${completed}/${needsEnrichment.length}] ${data.video.title.slice(0, 45)}... ${publishDate}`
        );
      } else {
        failed++;
        console.log(
          `[${completed}/${needsEnrichment.length}] ${data.video.title.slice(0, 45)}... FAILED`
        );
      }
    })
  );

  await Promise.all(tasks);

  console.log("\n=== Summary ===");
  console.log(`Enriched: ${success}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
