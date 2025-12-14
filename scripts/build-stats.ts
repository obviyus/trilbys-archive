/**
 * Computes interesting statistics from all caption files.
 * Outputs a JSON file that the stats page reads at build time.
 *
 * AIDEV-NOTE: This runs before astro build to generate stats.json
 * Stats include word frequencies, profanity counts, series breakdowns, etc.
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
    url: string;
    duration: number;
    playlistId: string;
    playlistTitle: string;
  };
  captions: Caption[];
  fetchedAt: string;
  publishedAt?: string;
}

interface VideoStats {
  id: string;
  title: string;
  duration: number;
  wordCount: number;
  wordsPerMinute: number;
  series: string;
  year?: number;
}

interface YearlyStats {
  year: number;
  videoCount: number;
  avgWords: number;
  avgWordsPerMinute: number;
  totalWords: number;
}

interface Stats {
  totalVideos: number;
  totalWords: number;
  totalDurationSeconds: number;
  totalCharacters: number;
  avgWordsPerVideo: number;
  avgDurationSeconds: number;
  avgWordsPerMinute: number;

  // Series breakdown
  seriesBreakdown: {
    name: string;
    count: number;
    totalWords: number;
    totalDuration: number;
  }[];

  // Top words (excluding stop words)
  topWords: { word: string; count: number }[];

  // Profanity stats
  profanityStats: {
    word: string;
    count: number;
    perVideo: number;
  }[];

  // Extremes
  longestVideo: { title: string; id: string; duration: number };
  shortestVideo: { title: string; id: string; duration: number };
  mostVerbose: { title: string; id: string; wordsPerMinute: number };
  leastVerbose: { title: string; id: string; wordsPerMinute: number };
  mostWords: { title: string; id: string; wordCount: number };
  leastWords: { title: string; id: string; wordCount: number };

  // Fun comparisons
  funFacts: {
    label: string;
    value: string;
  }[];

  // Year breakdown
  yearlyStats: YearlyStats[];

  topMentionedGames: { game: string; count: number }[];
}

const CAPTIONS_DIR = join(import.meta.dir, "../data/captions");
const OUTPUT_PATH = join(import.meta.dir, "../src/data/stats.json");

// Common English stop words to exclude from word frequency
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
  "used", "it", "its", "that", "this", "these", "those", "i", "you", "he",
  "she", "we", "they", "what", "which", "who", "whom", "whose", "where",
  "when", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "also", "now", "here",
  "there", "then", "once", "if", "about", "into", "through", "during",
  "before", "after", "above", "below", "between", "under", "again",
  "further", "because", "while", "although", "though", "even", "still",
  "already", "yet", "ever", "never", "always", "often", "sometimes",
  "usually", "really", "actually", "basically", "probably", "maybe",
  "perhaps", "anyway", "however", "therefore", "thus", "hence", "otherwise",
  "instead", "rather", "quite", "almost", "enough", "much", "many",
  "well", "up", "out", "off", "over", "back", "down", "around", "away",
  "going", "get", "got", "getting", "go", "goes", "went", "gone", "come",
  "comes", "came", "coming", "make", "makes", "made", "making", "take",
  "takes", "took", "taken", "taking", "see", "sees", "saw", "seen", "seeing",
  "know", "knows", "knew", "known", "knowing", "think", "thinks", "thought",
  "thinking", "say", "says", "said", "saying", "tell", "tells", "told",
  "telling", "ask", "asks", "asked", "asking", "want", "wants", "wanted",
  "wanting", "use", "uses", "using", "find", "finds", "found", "finding",
  "give", "gives", "gave", "given", "giving", "put", "puts", "putting",
  "try", "tries", "tried", "trying", "let", "lets", "letting", "seem",
  "seems", "seemed", "seeming", "feel", "feels", "felt", "feeling",
  "look", "looks", "looked", "looking", "thing", "things", "way", "ways",
  "time", "times", "year", "years", "day", "days", "man", "men", "woman",
  "women", "people", "person", "lot", "bit", "part", "point", "fact",
  "case", "kind", "sort", "first", "last", "next", "new", "old", "good",
  "bad", "great", "little", "big", "small", "long", "short", "high", "low",
  "right", "left", "real", "sure", "true", "whole", "different", "same",
  "another", "own", "one", "two", "three", "four", "five", "ten", "hundred",
  "being", "like", "dont", "doesnt", "didnt", "wont", "wouldnt", "couldnt",
  "shouldnt", "cant", "im", "youre", "hes", "shes", "its", "were", "theyre",
  "ive", "youve", "weve", "theyve", "id", "youd", "hed", "shed", "wed",
  "theyd", "ill", "youll", "hell", "shell", "well", "theyll", "isnt",
  "arent", "wasnt", "werent", "hasnt", "havent", "hadnt", "thats", "whats",
  "whos", "heres", "theres", "wheres", "hows", "whys", "lets", "theres",
  // Contractions with apostrophes (text processing keeps apostrophes)
  "it's", "that's", "there's", "what's", "who's", "here's", "where's", "how's",
  "why's", "let's", "i'm", "you're", "he's", "she's", "we're", "they're",
  "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd", "she'd",
  "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't",
  "won't", "wouldn't", "couldn't", "shouldn't", "can't", "don't", "doesn't",
  "didn't", "your", "them",
]);

// Profanity to track (including British slang)
const PROFANITY = [
  "fuck", "fucking", "fucked", "fucker", "fucks",
  "shit", "shitty", "shits",
  "ass", "arse", "arsehole",
  "bastard", "bastards",
  "damn", "damned",
  "hell",
  "crap", "crappy",
  "bollocks",
  "wank", "wanker", "wanking",
  "twat",
  "piss", "pissed", "pissing",
  "cock",
  "dick",
  "bugger",
  "bloody",
  "bitch",
  // British slang
  "sod", "sodding",
  "git",
  "tosser",
  "bellend",
  "knob",
  "tit", "tits",
  "pillock",
  "plonker",
  "minge",
  "shag", "shagging",
  "bum",
  "knobhead",
];

// Known game titles to look for (common ones Yahtzee reviews)
// AIDEV-NOTE: Avoid single common words that cause false positives (persona, inside, prey, souls, etc)
const GAME_KEYWORDS = [
  "zelda", "mario", "sonic", "halo", "doom", "call of duty",
  "assassin's creed", "assassins creed", "dark souls", "elden ring",
  "resident evil", "silent hill", "bioshock", "half-life", "halflife",
  "portal", "mass effect", "dragon age", "skyrim", "elder scrolls",
  "fallout", "grand theft auto", "red dead", "witcher",
  "god of war", "uncharted", "last of us", "metal gear", "final fantasy",
  "kingdom hearts", "pokemon", "metroid", "kirby", "smash bros",
  "battlefield", "minecraft", "fortnite",
  "overwatch", "borderlands", "far cry", "watch dogs",
  "tomb raider", "hitman", "deus ex", "dishonored", "wolfenstein",
  "quake", "duke nukem", "serious sam", "painkiller", "bulletstorm",
  "gears of war", "dead space", "alien isolation", "amnesia",
  "outlast", "layers of fear", "hollow knight",
  "cuphead", "celeste", "undertale", "shovel knight", "stardew valley",
  "terraria", "factorio", "rimworld", "cities skylines", "civilization",
  "xcom", "total war", "starcraft", "warcraft", "diablo", "path of exile",
  "league of legends", "counter-strike",
  "apex legends", "titanfall", "nier automata", "yakuza",
  "persona 5", "fire emblem", "xenoblade", "bayonetta", "devil may cry",
  "monster hunter", "death stranding", "cyberpunk 2077", "cyberpunk", "sekiro",
  "bloodborne", "demon's souls", "demons souls", "armored core",
  "spider-man", "spiderman", "ratchet and clank", "horizon zero dawn",
  "ghost of tsushima", "returnal", "alan wake", "bioshock infinite",
  "spec ops", "spec ops the line", "saints row", "crysis",
];

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

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(Zero Punctuation\)\s*/gi, "")
    .replace(/\s*\(Fully Ramblomatic\)\s*/gi, "")
    .trim();
}

// AIDEV-NOTE: Skip compilation videos, ads, announcements, and non-reviews from stats
function shouldSkipVideo(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  // Skip "Every X" compilation videos
  if (lowerTitle.startsWith("every ")) return true;
  // Skip merch/ad videos
  if (lowerTitle.includes("limited edition") && lowerTitle.includes("merch")) return true;
  // Skip holiday videos
  if (lowerTitle.startsWith("holiday")) return true;
  // Skip announcements and non-reviews
  if (lowerTitle.includes("on the escapist")) return true;
  if (lowerTitle.includes("video game voters network")) return true;
  if (lowerTitle.includes("april fools")) return true;
  if (lowerTitle.includes("yahtzee goes to")) return true;
  if (lowerTitle.includes("best, worst and blandest")) return true;
  if (lowerTitle.includes("best and worst of")) return true;
  if (lowerTitle.startsWith("unskippable:")) return true;
  return false;
}

function getSeries(playlistTitle: string): string {
  return playlistTitle.includes("Zero Punctuation")
    ? "Zero Punctuation"
    : "Fully Ramblomatic";
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

async function main() {
  console.log("Computing statistics...");

  const glob = new Glob("*.json");
  const videos: VideoStats[] = [];
  const wordCounts = new Map<string, number>();
  const profanityCounts = new Map<string, number>();
  const gameMentions = new Map<string, number>();
  const seriesData = new Map<string, { count: number; words: number; duration: number }>();
  const yearlyData = new Map<number, { count: number; words: number; duration: number }>();

  let totalWords = 0;
  let totalDuration = 0;
  let totalCharacters = 0;

  // Initialize profanity counts
  for (const word of PROFANITY) {
    profanityCounts.set(word, 0);
  }

  for await (const file of glob.scan(CAPTIONS_DIR)) {
    const filePath = join(CAPTIONS_DIR, file);
    const data: VideoData = await Bun.file(filePath).json();

    if (!data.captions || data.captions.length === 0) continue;
    if (shouldSkipVideo(data.video.title)) continue;

    const series = getSeries(data.video.playlistTitle);
    const fullText = data.captions
      .map((c) => decodeHtmlEntities(c.text))
      .join(" ")
      .toLowerCase();

    const words = fullText
      .replace(/[^a-z'\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const wordCount = words.length;
    const wpm = data.video.duration > 0
      ? Math.round((wordCount / data.video.duration) * 60)
      : 0;

    // Extract year from publishedAt (format: YYYY-MM-DD)
    const year = data.publishedAt ? parseInt(data.publishedAt.slice(0, 4), 10) : undefined;

    videos.push({
      id: data.video.id,
      title: cleanTitle(data.video.title),
      duration: data.video.duration,
      wordCount,
      wordsPerMinute: wpm,
      series,
      year,
    });

    totalWords += wordCount;
    totalDuration += data.video.duration;
    totalCharacters += fullText.length;

    // Yearly breakdown
    if (year) {
      const yearData = yearlyData.get(year) || { count: 0, words: 0, duration: 0 };
      yearData.count++;
      yearData.words += wordCount;
      yearData.duration += data.video.duration;
      yearlyData.set(year, yearData);
    }

    // Series breakdown
    const existing = seriesData.get(series) || { count: 0, words: 0, duration: 0 };
    existing.count++;
    existing.words += wordCount;
    existing.duration += data.video.duration;
    seriesData.set(series, existing);

    // Word frequency
    for (const word of words) {
      if (!STOP_WORDS.has(word) && word.length > 3) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Profanity counting
    for (const profane of PROFANITY) {
      const regex = new RegExp(`\\b${profane}\\b`, "gi");
      const matches = fullText.match(regex);
      if (matches) {
        profanityCounts.set(profane, (profanityCounts.get(profane) || 0) + matches.length);
      }
    }

    // Game mentions
    for (const game of GAME_KEYWORDS) {
      if (fullText.includes(game.toLowerCase())) {
        gameMentions.set(game, (gameMentions.get(game) || 0) + 1);
      }
    }
  }

  // Sort and compute stats
  const sortedWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, count]) => ({ word, count }));

  const sortedProfanity = [...profanityCounts.entries()]
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({
      word,
      count,
      perVideo: Math.round((count / videos.length) * 100) / 100,
    }));

  const sortedGames = [...gameMentions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([game, count]) => ({ game, count }));

  // Compute yearly stats (sorted by year)
  const yearlyStats: YearlyStats[] = [...yearlyData.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, data]) => ({
      year,
      videoCount: data.count,
      avgWords: Math.round(data.words / data.count),
      avgWordsPerMinute: Math.round((data.words / data.duration) * 60),
      totalWords: data.words,
    }));

  console.log(`Yearly data available for ${yearlyStats.length} years`);

  // Find extremes
  const byDuration = [...videos].sort((a, b) => b.duration - a.duration);
  const byWords = [...videos].sort((a, b) => b.wordCount - a.wordCount);
  const byWpm = [...videos].filter((v) => v.duration > 60).sort((a, b) => b.wordsPerMinute - a.wordsPerMinute);

  // Compute fun facts
  const totalFucks = profanityCounts.get("fuck") || 0;
  const totalFucking = profanityCounts.get("fucking") || 0;
  const totalShit = profanityCounts.get("shit") || 0;
  const allFWords = totalFucks + totalFucking + (profanityCounts.get("fucked") || 0) + (profanityCounts.get("fucker") || 0);

  const avgVideoMins = Math.round(totalDuration / videos.length / 60);
  const totalHours = Math.round(totalDuration / 3600);
  const wordsPerPage = 250; // Average words per page
  const totalPages = Math.round(totalWords / wordsPerPage);

  const funFacts = [
    {
      label: "If printed as a book",
      value: `~${totalPages.toLocaleString()} pages (${Math.round(totalPages / 300)} novels)`,
    },
    {
      label: "F-bombs dropped",
      value: `${allFWords.toLocaleString()} total (${Math.round(allFWords / videos.length * 10) / 10} per video)`,
    },
    {
      label: "Speaking rate",
      value: `${Math.round(totalWords / totalDuration * 60)} words/minute average`,
    },
    {
      label: "Binge watch time",
      value: `${Math.round(totalHours / 24)} days non-stop`,
    },
    {
      label: "Words typed per year",
      value: `~${Math.round(totalWords / 17).toLocaleString()} (17 years of content)`,
    },
    {
      label: "If read aloud at normal pace",
      value: `${Math.round(totalWords / 150 / 60)} hours`,
    },
  ];

  const stats: Stats = {
    totalVideos: videos.length,
    totalWords,
    totalDurationSeconds: totalDuration,
    totalCharacters,
    avgWordsPerVideo: Math.round(totalWords / videos.length),
    avgDurationSeconds: Math.round(totalDuration / videos.length),
    avgWordsPerMinute: Math.round((totalWords / totalDuration) * 60),

    seriesBreakdown: [...seriesData.entries()].map(([name, data]) => ({
      name,
      count: data.count,
      totalWords: data.words,
      totalDuration: data.duration,
      avgWordsPerVideo: Math.round(data.words / data.count),
      wordsPerMinute: Math.round((data.words / data.duration) * 60),
    })),

    topWords: sortedWords,
    profanityStats: sortedProfanity,

    longestVideo: {
      title: byDuration[0].title,
      id: byDuration[0].id,
      duration: byDuration[0].duration,
    },
    shortestVideo: {
      title: byDuration[byDuration.length - 1].title,
      id: byDuration[byDuration.length - 1].id,
      duration: byDuration[byDuration.length - 1].duration,
    },
    mostVerbose: {
      title: byWpm[0].title,
      id: byWpm[0].id,
      wordsPerMinute: byWpm[0].wordsPerMinute,
    },
    leastVerbose: {
      title: byWpm[byWpm.length - 1].title,
      id: byWpm[byWpm.length - 1].id,
      wordsPerMinute: byWpm[byWpm.length - 1].wordsPerMinute,
    },
    mostWords: {
      title: byWords[0].title,
      id: byWords[0].id,
      wordCount: byWords[0].wordCount,
    },
    leastWords: {
      title: byWords[byWords.length - 1].title,
      id: byWords[byWords.length - 1].id,
      wordCount: byWords[byWords.length - 1].wordCount,
    },

    funFacts,
    yearlyStats,
    topMentionedGames: sortedGames,
  };

  // Ensure output directory exists
  const outputDir = join(import.meta.dir, "../src/data");
  await Bun.write(join(outputDir, ".gitkeep"), "");
  await Bun.write(OUTPUT_PATH, JSON.stringify(stats, null, 2));

  console.log(`Stats computed for ${videos.length} videos`);
  console.log(`Output written to ${OUTPUT_PATH}`);
}

main().catch(console.error);
