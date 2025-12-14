/**
 * Generates a client-side captions index for the custom search UI.
 * Creates JSON files in public/captions/ that can be fetched on demand.
 */

import { Glob } from "bun";
import { join } from "node:path";

interface Caption {
  text: string;
  offset: number;
  duration: number;
}

interface VideoData {
  video: {
    id: string;
    title: string;
    duration: number;
    playlistTitle: string;
  };
  captions: Caption[];
}

// Compact caption format for client: [text, offset]
type CompactCaption = [string, number];

interface CompactVideo {
  title: string;
  series: string;
  captions: CompactCaption[];
}

const CAPTIONS_DIR = join(import.meta.dir, "../data/captions");
const OUTPUT_DIR = join(import.meta.dir, "../public/captions");

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

async function main() {
  console.log("Building client-side captions index...");

  // Clean and recreate output directory
  await Bun.write(`${OUTPUT_DIR}/.gitkeep`, "");

  const glob = new Glob("*.json");
  const jsonFiles: string[] = [];

  for await (const file of glob.scan(CAPTIONS_DIR)) {
    jsonFiles.push(file);
  }

  console.log(`Processing ${jsonFiles.length} caption files...`);

  let processed = 0;
  const index: Record<string, { title: string; series: string }> = {};

  for (const file of jsonFiles) {
    const filePath = join(CAPTIONS_DIR, file);
    const data: VideoData = await Bun.file(filePath).json();

    if (!data.captions || data.captions.length === 0) {
      continue;
    }

    const series = data.video.playlistTitle.includes("Zero Punctuation")
      ? "Zero Punctuation"
      : "Fully Ramblomatic";

    const cleanTitle = data.video.title
      .replace(/\s*\(Zero Punctuation\)\s*/gi, "")
      .replace(/\s*\(Fully Ramblomatic\)\s*/gi, "")
      .trim();

    // Create compact format
    const compactVideo: CompactVideo = {
      title: cleanTitle,
      series,
      captions: data.captions.map((cap) => [
        decodeHtmlEntities(cap.text.replace(/\n/g, " ")),
        Math.floor(cap.offset),
      ]),
    };

    // Write individual video caption file
    await Bun.write(
      join(OUTPUT_DIR, `${data.video.id}.json`),
      JSON.stringify(compactVideo)
    );

    // Add to index
    index[data.video.id] = { title: cleanTitle, series };

    processed++;
    if (processed % 100 === 0) {
      console.log(`Processed ${processed}/${jsonFiles.length}`);
    }
  }

  // Write the index file
  await Bun.write(
    join(OUTPUT_DIR, "index.json"),
    JSON.stringify(index)
  );

  console.log(`Done! Generated ${processed} caption files in ${OUTPUT_DIR}`);
}

main().catch(console.error);
