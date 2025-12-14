/**
 * Transforms caption JSON files into styled HTML pages for Pagefind indexing.
 * Each video becomes a searchable page with transcript content.
 *
 * AIDEV-NOTE: Pagefind indexes HTML output. We generate styled HTML pages
 * that exist primarily for indexing but also serve as readable transcripts.
 * Search results link to YouTube with timestamps via data-pagefind-meta.
 */

import { $ } from "bun";
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
    url: string;
    duration: number;
    playlistId: string;
    playlistTitle: string;
  };
  captions: Caption[];
  fetchedAt: string;
}

const CAPTIONS_DIR = join(import.meta.dir, "../data/captions");
const OUTPUT_DIR = join(import.meta.dir, "../src/pages/transcript");

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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function generatePage(data: VideoData): string {
  const { video, captions } = data;
  const series = video.playlistTitle.includes("Zero Punctuation")
    ? "Zero Punctuation"
    : "Fully Ramblomatic";

  // Clean title
  const cleanTitle = video.title
    .replace(/\s*\(Zero Punctuation\)\s*/gi, "")
    .replace(/\s*\(Fully Ramblomatic\)\s*/gi, "")
    .trim();

  // Combine captions into flowing prose with timestamp links
  const transcriptHtml = captions
    .map((cap) => {
      const timestamp = Math.floor(cap.offset);
      const youtubeLink = `https://youtu.be/${video.id}?t=${timestamp}`;
      const text = decodeHtmlEntities(cap.text.replace(/\n/g, " "));
      return `<a href="${youtubeLink}" class="caption-segment" data-pagefind-meta="url[href]" title="Jump to ${formatTimestamp(timestamp)}">${text}</a>`;
    })
    .join(" ");

  return `---
// This page exists for Pagefind indexing and as a readable transcript
export const prerender = true;
---
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${cleanTitle} — Trilby's Archive</title>
  <meta name="description" content="Full transcript of ${cleanTitle} from ${series}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${cleanTitle} — Trilby's Archive">
  <meta property="og:description" content="Full transcript of ${cleanTitle} from ${series}">
  <meta property="og:image" content="https://trilbys-archive.pages.dev/preview.jpg">
  <meta property="og:url" content="https://trilbys-archive.pages.dev/transcript/${video.id}">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${cleanTitle} — Trilby's Archive">
  <meta name="twitter:description" content="Full transcript of ${cleanTitle} from ${series}">
  <meta name="twitter:image" content="https://trilbys-archive.pages.dev/preview.jpg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Special+Elite&display=swap" rel="stylesheet">
  <style>
    :root {
      --zp-yellow: #f5c518;
      --zp-gold: #e5a500;
      --parchment: #faf6e9;
      --parchment-dark: #f0e9d2;
      --ink: #1a1612;
      --ink-light: #3d352d;
      --burgundy: #722f37;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "Libre Baskerville", Georgia, serif;
      background: var(--parchment);
      color: var(--ink);
      min-height: 100vh;
      line-height: 1.8;
    }

    .page-border {
      position: fixed;
      inset: 8px;
      border: 3px double var(--zp-gold);
      pointer-events: none;
      z-index: 100;
    }

    .container {
      max-width: 750px;
      margin: 0 auto;
      padding: 3rem 2rem 4rem;
    }

    /* Header */
    header {
      text-align: center;
      padding-bottom: 2rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid var(--ink);
      position: relative;
    }

    header::after {
      content: "";
      position: absolute;
      bottom: -5px;
      left: 0;
      right: 0;
      height: 1px;
      background: var(--ink);
    }

    .back-link {
      font-family: "Special Elite", monospace;
      font-size: 0.75rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--burgundy);
      text-decoration: none;
      display: inline-block;
      margin-bottom: 1.5rem;
      border-bottom: 1px dotted var(--burgundy);
      transition: border-color 0.2s;
    }

    .back-link:hover {
      border-bottom-style: solid;
    }

    .series-badge {
      font-family: "Special Elite", monospace;
      font-size: 0.65rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      background: var(--zp-yellow);
      color: var(--ink);
      padding: 0.3em 0.8em;
      display: inline-block;
      margin-bottom: 1rem;
    }

    h1 {
      font-family: "Playfair Display", serif;
      font-size: clamp(1.8rem, 5vw, 2.8rem);
      font-weight: 700;
      margin: 0;
      line-height: 1.2;
      color: var(--ink);
    }

    .meta {
      font-family: "Special Elite", monospace;
      font-size: 0.75rem;
      color: var(--ink-light);
      margin-top: 1rem;
      display: flex;
      justify-content: center;
      gap: 2rem;
      flex-wrap: wrap;
    }

    .watch-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-family: "Special Elite", monospace;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
      background: var(--burgundy);
      color: var(--parchment);
      padding: 0.75em 1.5em;
      text-decoration: none;
      margin-top: 1.5rem;
      border: 2px solid var(--ink);
      box-shadow: 3px 3px 0 var(--ink);
      transition: all 0.15s ease;
    }

    .watch-btn:hover {
      transform: translate(-2px, -2px);
      box-shadow: 5px 5px 0 var(--ink);
    }

    /* Transcript */
    article {
      position: relative;
    }

    .transcript-header {
      font-family: "Special Elite", monospace;
      font-size: 0.7rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--ink-light);
      text-align: center;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .transcript-header::before,
    .transcript-header::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--zp-gold);
    }

    .transcript {
      font-size: 1.05rem;
      text-align: justify;
      hyphens: auto;
    }

    .caption-segment {
      color: inherit;
      text-decoration: none;
      transition: background 0.15s ease;
      border-radius: 2px;
    }

    .caption-segment:hover {
      background: var(--zp-yellow);
    }

    /* Drop cap */
    .transcript .caption-segment:first-child::first-letter {
      font-family: "Playfair Display", serif;
      float: left;
      font-size: 4rem;
      line-height: 0.8;
      padding-right: 0.15em;
      color: var(--burgundy);
      font-weight: 700;
    }

    /* Footer */
    footer {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--zp-gold);
      text-align: center;
      font-size: 0.8rem;
      color: var(--ink-light);
    }

    footer p {
      margin: 0.5rem 0;
    }

    footer a {
      color: var(--burgundy);
      text-decoration: none;
      border-bottom: 1px dotted var(--burgundy);
    }

    /* Hidden metadata for Pagefind */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (max-width: 640px) {
      .container {
        padding: 2rem 1.5rem;
      }

      .page-border {
        display: none;
      }

      .meta {
        flex-direction: column;
        gap: 0.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="page-border"></div>

  <div class="container">
    <header>
      <a href="/" class="back-link">← Return to Archives</a>
      <div class="series-badge">${series}</div>
      <h1 data-pagefind-meta="title">${cleanTitle}</h1>
      <div class="meta">
        <span>Duration: ${formatDuration(video.duration)}</span>
      </div>
      <a href="https://youtu.be/${video.id}" class="watch-btn" target="_blank" rel="noopener">
        ▶ Watch on YouTube
      </a>
    </header>

    <article data-pagefind-body>
      <p class="sr-only" data-pagefind-filter-series="${series}" data-pagefind-meta="series">${series}</p>
      <p class="sr-only" data-pagefind-meta="duration">${formatDuration(video.duration)}</p>
      <p class="sr-only" data-pagefind-meta="videoId">${video.id}</p>

      <div class="transcript-header">Full Transcript</div>
      <div class="transcript" data-pagefind-weight="10">
        ${transcriptHtml}
      </div>
    </article>

    <footer>
      <p>Click any text to jump to that moment in the video.</p>
      <p><a href="/">Search more reviews</a> at Trilby's Archive</p>
    </footer>
  </div>
</body>
</html>`;
}

async function main() {
  console.log("Building search index pages...");

  // Clean and recreate output directory using Bun shell
  await $`rm -rf ${OUTPUT_DIR}`.quiet();
  await $`mkdir -p ${OUTPUT_DIR}`.quiet();

  // Use Bun.Glob to find all JSON files
  const glob = new Glob("*.json");
  const jsonFiles: string[] = [];

  for await (const file of glob.scan(CAPTIONS_DIR)) {
    jsonFiles.push(file);
  }

  console.log(`Processing ${jsonFiles.length} caption files...`);

  let processed = 0;
  for (const file of jsonFiles) {
    const filePath = join(CAPTIONS_DIR, file);
    const data: VideoData = await Bun.file(filePath).json();

    // Skip videos with no captions
    if (!data.captions || data.captions.length === 0) {
      console.log(`Skipping ${file} - no captions`);
      continue;
    }

    const pageContent = generatePage(data);
    const outputPath = join(OUTPUT_DIR, `${data.video.id}.astro`);
    await Bun.write(outputPath, pageContent);

    processed++;
    if (processed % 100 === 0) {
      console.log(`Processed ${processed}/${jsonFiles.length}`);
    }
  }

  console.log(`Done! Generated ${processed} pages in ${OUTPUT_DIR}`);
}

main().catch(console.error);
