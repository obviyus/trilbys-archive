import { $ } from "bun";
import Groq, { toFile } from "groq-sdk";
import pLimit from "p-limit";

// AIDEV-NOTE: Fallback transcription script using Groq Whisper API for videos without YouTube captions.
// Uses whisper-large-v3 with video title as prompt for better accuracy on game-specific vocabulary.
// Requires: GROQ_API_KEY env var, yt-dlp, ffmpeg
// Run with: bun run scripts/transcribe-fallback.ts [--limit N]

const DATA_DIR = "./data";
const CAPTIONS_DIR = `${DATA_DIR}/captions`;
const PROGRESS_FILE = `${DATA_DIR}/progress.json`;
const TEMP_DIR = `${DATA_DIR}/temp-audio`;

const WHISPER_MODEL = "whisper-large-v3";
const CONCURRENCY_LIMIT = 5;

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

interface GroqSegment {
  start: number;
  end: number;
  text: string;
}

interface GroqVerboseResponse {
  text: string;
  segments: GroqSegment[];
}

const groq = new Groq();

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

async function getVideoInfo(videoId: string): Promise<VideoInfo | null> {
  try {
    const result =
      await $`yt-dlp --dump-json --cookies-from-browser chrome --no-warnings https://youtu.be/${videoId}`.text();
    const data = JSON.parse(result);

    return {
      id: videoId,
      title: data.title || "Unknown",
      url: `https://youtu.be/${videoId}`,
      duration: data.duration || 0,
      playlistId: data.playlist_id || "unknown",
      playlistTitle: data.playlist_title || "Zero Punctuation",
    };
  } catch (error) {
    console.error(`Failed to get video info for ${videoId}:`, error);
    return null;
  }
}

async function downloadAudio(videoId: string): Promise<string | null> {
  const outputPath = `${TEMP_DIR}/${videoId}.wav`;

  try {
    await $`mkdir -p ${TEMP_DIR}`.quiet();

    const file = Bun.file(outputPath);
    if (await file.exists()) {
      return outputPath;
    }

    console.log(`  Downloading audio...`);
    // AIDEV-NOTE: 16kHz mono wav is optimal for Groq (smaller file, lower latency)
    await $`yt-dlp -x --cookies-from-browser chrome --audio-format wav --postprocessor-args "ffmpeg:-ar 16000 -ac 1" --no-warnings -o ${outputPath} https://youtu.be/${videoId}`.quiet();

    return outputPath;
  } catch (error) {
    console.error(`  Failed to download audio for ${videoId}:`, error);
    return null;
  }
}

async function transcribeWithGroq(
  audioPath: string,
  videoTitle: string
): Promise<CaptionEntry[]> {
  console.log(`  Transcribing with Groq (${WHISPER_MODEL})...`);

  // Build prompt from video title for better accuracy on game names
  const prompt = `Video game review: ${videoTitle}. British accent, fast-paced commentary.`;

  const audioFile = Bun.file(audioPath);
  const response = await groq.audio.transcriptions.create({
    file: await toFile(await audioFile.arrayBuffer(), audioPath),
    model: WHISPER_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    language: "en",
    prompt,
  });

  // Cast to verbose response type (SDK types don't include segments)
  const result = response as unknown as GroqVerboseResponse;

  if (!result.segments || result.segments.length === 0) {
    return [];
  }

  // Convert Groq segments to our caption format
  const captions: CaptionEntry[] = result.segments.map((segment) => ({
    text: segment.text.trim(),
    offset: segment.start,
    duration: segment.end - segment.start,
  }));

  return captions;
}

async function cleanupAudio(videoId: string): Promise<void> {
  try {
    await $`rm -f ${TEMP_DIR}/${videoId}.*`.quiet();
  } catch {
    // Ignore cleanup errors
  }
}

async function processVideo(
  videoId: string,
  progress: Progress
): Promise<boolean> {
  console.log(`\nProcessing: ${videoId}`);

  const videoInfo = await getVideoInfo(videoId);
  if (!videoInfo) {
    console.log(`  Skipping: Could not get video info`);
    return false;
  }

  console.log(`  Title: ${videoInfo.title}`);
  console.log(`  Duration: ${Math.round(videoInfo.duration / 60)}m`);

  const audioPath = await downloadAudio(videoId);
  if (!audioPath) {
    return false;
  }

  try {
    const captions = await transcribeWithGroq(audioPath, videoInfo.title);

    if (captions.length === 0) {
      console.log(`  Failed: No captions generated`);
      await cleanupAudio(videoId);
      return false;
    }

    const captionData: VideoCaption = {
      video: videoInfo,
      captions,
      fetchedAt: new Date().toISOString(),
    };
    await saveCaptions(captionData);

    // Update progress
    progress.processedVideos.push(videoId);
    progress.failedVideos = progress.failedVideos.filter(
      (f) => f.id !== videoId
    );

    await cleanupAudio(videoId);

    console.log(`  Success: ${captions.length} segments`);
    return true;
  } catch (error) {
    console.error(`  Transcription failed:`, error);
    await cleanupAudio(videoId);
    return false;
  }
}

async function main() {
  console.log("=== Yahtzee Fallback Transcriber (Groq Whisper) ===\n");

  // Parse arguments
  const args = process.argv.slice(2);
  let limit = 1; // Default to 1 for testing

  const limitIdx = args.indexOf("--limit");
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10);
  }

  const progress = await loadProgress();
  const failedVideos = progress.failedVideos;

  console.log(`Failed videos to process: ${failedVideos.length}`);
  console.log(`Processing limit: ${limit}`);

  if (failedVideos.length === 0) {
    console.log("\nNo failed videos to process!");
    return;
  }

  const toProcess = failedVideos.slice(0, limit);
  let successCount = 0;
  let failCount = 0;
  let completed = 0;

  const limitFn = pLimit(CONCURRENCY_LIMIT);

  const tasks = toProcess.map((failed) =>
    limitFn(async () => {
      const success = await processVideo(failed.id, progress);
      completed++;

      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Save progress periodically
      if (completed % 5 === 0) {
        await saveProgress(progress);
      }

      console.log(`  [${completed}/${toProcess.length}]`);
    })
  );

  await Promise.all(tasks);

  // Final save
  await saveProgress(progress);

  console.log("\n=== Summary ===");
  console.log(`Processed: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Remaining: ${progress.failedVideos.length}`);
}

main().catch(console.error);
