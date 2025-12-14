import { $ } from "bun";
import { YoutubeTranscript } from "@danielxceron/youtube-transcript";
import pLimit from "p-limit";

// AIDEV-NOTE: This script grabs captions from YouTube playlists.
// Run with: bun run scripts/grab-captions.ts
// Requires: yt-dlp installed (brew install yt-dlp)

const PLAYLISTS = [
  // Zero Punctuation (The Escapist)
  { id: "PLAbMhAYRuCUhawCEV2oXZGrienoKTN16X", name: "Zero Punctuation" },
  // Second Wind (Fully Ramblomatic)
  { id: "PLUBKwq0XD0ueR3CXGUhGpsD1puLcYJPUp", name: "Second Wind" },
];

const DATA_DIR = "./data";
const CAPTIONS_DIR = `${DATA_DIR}/captions`;
const PROGRESS_FILE = `${DATA_DIR}/progress.json`;

// Concurrency limit for parallel processing
const CONCURRENCY_LIMIT = 10;

interface VideoInfo {
  id: string;
  title: string;
  url: string;
  duration: number;
  playlistId: string;
  playlistTitle: string;
}

interface CaptionEntry {
  text: string;
  offset: number;
  duration: number;
}

interface VideoCaption {
  video: VideoInfo;
  captions: CaptionEntry[];
  fetchedAt: string;
}

interface Progress {
  processedVideos: string[];
  failedVideos: { id: string; error: string; lastAttempt: string }[];
  lastRun: string;
}

async function loadProgress(): Promise<Progress> {
  const file = Bun.file(PROGRESS_FILE);
  if (await file.exists()) {
    return file.json();
  }
  return { processedVideos: [], failedVideos: [], lastRun: "" };
}

async function saveProgress(progress: Progress): Promise<void> {
  progress.lastRun = new Date().toISOString();
  await Bun.write(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function saveCaptions(caption: VideoCaption): Promise<void> {
  const filePath = `${CAPTIONS_DIR}/${caption.video.id}.json`;
  await Bun.write(filePath, JSON.stringify(caption, null, 2));
}

interface YtDlpEntry {
  id: string;
  title: string;
  url: string;
  duration: number;
}

async function fetchPlaylistVideos(
  playlistId: string,
  playlistName: string
): Promise<VideoInfo[]> {
  console.log(`\nFetching playlist: ${playlistName} (${playlistId})`);

  const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

  // Use yt-dlp to get playlist info as JSON
  const result =
    await $`yt-dlp --flat-playlist --dump-json --no-warnings ${playlistUrl}`.text();

  const videos: VideoInfo[] = [];

  // Each line is a JSON object for one video
  for (const line of result.trim().split("\n")) {
    if (!line) continue;
    try {
      const entry: YtDlpEntry = JSON.parse(line);
      videos.push({
        id: entry.id,
        title: entry.title || "Unknown",
        url: `https://youtu.be/${entry.id}`,
        duration: entry.duration || 0,
        playlistId,
        playlistTitle: playlistName,
      });
    } catch {
      // Skip malformed lines
    }
  }

  console.log(`  Found ${videos.length} videos total`);
  return videos;
}

// AIDEV-NOTE: Fallback chain: youtube-transcript library -> yt-dlp auto-subs
// yt-dlp is slower but more reliable for auto-generated captions
async function parseVttFile(vttPath: string): Promise<CaptionEntry[]> {
  const file = Bun.file(vttPath);
  if (!(await file.exists())) return [];

  const content = await file.text();
  const entries: CaptionEntry[] = [];

  // VTT format: timestamp lines like "00:00:01.234 --> 00:00:04.567"
  // followed by text content
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    // Find the timestamp line
    const timestampLine = lines.find((l) => l.includes("-->"));
    if (!timestampLine) continue;

    const match = timestampLine.match(
      /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
    );
    if (!match) continue;

    const startMs =
      parseInt(match[1]) * 3600000 +
      parseInt(match[2]) * 60000 +
      parseInt(match[3]) * 1000 +
      parseInt(match[4]);
    const endMs =
      parseInt(match[5]) * 3600000 +
      parseInt(match[6]) * 60000 +
      parseInt(match[7]) * 1000 +
      parseInt(match[8]);

    // Text is everything after the timestamp line (skip cue identifiers)
    const textStartIdx = lines.indexOf(timestampLine) + 1;
    const text = lines
      .slice(textStartIdx)
      .join(" ")
      .replace(/<[^>]+>/g, "") // Strip VTT tags like <c>, </c>
      .trim();

    if (text) {
      entries.push({
        text,
        offset: startMs,
        duration: endMs - startMs,
      });
    }
  }

  return entries;
}

async function cleanupTempFiles(tempDir: string, videoId: string): Promise<void> {
  // Use find + xargs to avoid zsh glob errors when no files match
  try {
    await $`find ${tempDir} -name "${videoId}*" -type f -delete 2>/dev/null`.quiet();
  } catch {
    // Ignore cleanup errors
  }
}

async function fetchCaptionsWithYtDlp(
  video: VideoInfo
): Promise<CaptionEntry[] | null> {
  const tempDir = `${DATA_DIR}/temp`;
  const tempFile = `${tempDir}/${video.id}`;

  try {
    // Ensure temp dir exists
    await $`mkdir -p ${tempDir}`.quiet();

    // Try to get subtitles (manual first, then auto-generated)
    await $`yt-dlp --write-sub --write-auto-sub --sub-lang en --sub-format vtt --skip-download --no-warnings -o ${tempFile} https://youtu.be/${video.id}`.quiet();

    // Check for subtitle files (prefer manual over auto)
    const vttFiles = [
      `${tempFile}.en.vtt`,
      `${tempFile}.en-orig.vtt`,
      `${tempFile}.en-US.vtt`,
    ];

    for (const vttPath of vttFiles) {
      const entries = await parseVttFile(vttPath);
      if (entries.length > 0) {
        await cleanupTempFiles(tempDir, video.id);
        return entries;
      }
    }

    await cleanupTempFiles(tempDir, video.id);
    return null;
  } catch {
    await cleanupTempFiles(tempDir, video.id);
    return null;
  }
}

async function fetchCaptions(video: VideoInfo): Promise<CaptionEntry[] | null> {
  // Try youtube-transcript library first (faster)
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(video.id);
    if (transcript && transcript.length > 0) {
      return transcript.map((entry) => ({
        text: entry.text,
        offset: entry.offset,
        duration: entry.duration,
      }));
    }
  } catch {
    // Fall through to yt-dlp
  }

  // Fallback to yt-dlp
  return fetchCaptionsWithYtDlp(video);
}

async function main() {
  console.log("=== Yahtzee Caption Grabber ===\n");

  // Ensure directories exist
  await Bun.write(`${CAPTIONS_DIR}/.gitkeep`, "");

  const progress = await loadProgress();
  console.log(`Previously processed: ${progress.processedVideos.length} videos`);
  console.log(`Previously failed: ${progress.failedVideos.length} videos`);

  // Collect all videos from all playlists
  const allVideos: VideoInfo[] = [];
  for (const playlist of PLAYLISTS) {
    try {
      const videos = await fetchPlaylistVideos(playlist.id, playlist.name);
      allVideos.push(...videos);
    } catch (error) {
      console.error(`  Failed to fetch playlist ${playlist.name}:`, error);
    }
  }

  // Filter out already processed videos
  const pendingVideos = allVideos.filter(
    (v) => !progress.processedVideos.includes(v.id)
  );

  console.log(`\nTotal videos: ${allVideos.length}`);
  console.log(`Pending videos: ${pendingVideos.length}`);

  if (pendingVideos.length === 0) {
    console.log("\nAll videos already processed!");
    return;
  }

  // Process videos with concurrency limit
  const limit = pLimit(CONCURRENCY_LIMIT);
  let completed = 0;
  let processed = 0;
  let failed = 0;

  const tasks = pendingVideos.map((video) =>
    limit(async () => {
      const captions = await fetchCaptions(video);
      completed++;

      if (captions && captions.length > 0) {
        const captionData: VideoCaption = {
          video,
          captions,
          fetchedAt: new Date().toISOString(),
        };
        await saveCaptions(captionData);
        progress.processedVideos.push(video.id);
        processed++;
        console.log(
          `[${completed}/${pendingVideos.length}] ${video.title.slice(0, 50)}... OK (${captions.length} segments)`
        );
      } else {
        const existingFailure = progress.failedVideos.find(
          (f) => f.id === video.id
        );
        if (existingFailure) {
          existingFailure.lastAttempt = new Date().toISOString();
        } else {
          progress.failedVideos.push({
            id: video.id,
            error: "No captions available",
            lastAttempt: new Date().toISOString(),
          });
        }
        failed++;
        console.log(
          `[${completed}/${pendingVideos.length}] ${video.title.slice(0, 50)}... FAILED`
        );
      }

      // Save progress periodically
      if (completed % 50 === 0) {
        await saveProgress(progress);
      }
    })
  );

  await Promise.all(tasks);

  // Final save
  await saveProgress(progress);

  console.log("\n=== Summary ===");
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total in database: ${progress.processedVideos.length}`);
}

main().catch(console.error);
