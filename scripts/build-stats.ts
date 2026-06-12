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
  swearCount: number;
  series: string;
  year?: number;
}

interface YearlyStats {
  year: number;
  videoCount: number;
  avgWords: number;
  avgWordsPerMinute: number;
  totalWords: number;
  swearsPer1000Words: number;
}

interface Simile {
  text: string;
  videoId: string;
  videoTitle: string;
  t: number;
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

  // Yahtzee-isms
  similes: Simile[];
  totalSimiles: number;
  totalSwears: number;
  sweariestEpisodes: { title: string; id: string; count: number; perMinute: number }[];
  cleanestEpisode: { title: string; id: string; count: number };
  petPeeves: { label: string; mentions: number; videos: number }[];
  darkSouls: { mentions: number; videosMentioning: number; actualReviews: number };
  vocabulary: { uniqueWords: number; hapaxCount: number; hapaxSample: string[] };
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
  "didn't", "your", "them", "their", "theirs", "him", "his", "her", "hers",
  "our", "ours", "yours", "mine", "myself", "itself", "himself", "herself",
  "something", "someone", "somewhere", "anything", "anyone", "anywhere",
  "everything", "everyone", "nothing", "yeah",
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

// Yahtzee's signature absurd similes: "like a donkey on a staircase"
// Require 3+ words and trailing punctuation so we only capture complete clauses
const SIMILE_REGEX = /\blike (?:a|an|some) (?:[A-Za-z'’-]+ ){3,13}[A-Za-z'’-]+(?=[.,!?;:])/g;

// "like a bit of X" is filler, not a simile
const SIMILE_BAD_START = /^like (?:a|an) (?:bit|lot|couple|load|number) of\b/;

// Similes ending in these words got truncated mid-clause; skip them
const SIMILE_BAD_ENDINGS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "but", "with", "in", "on", "at",
  "as", "who", "that", "which", "for", "their", "his", "her", "my", "your",
  "its", "is", "was", "be", "has", "had", "it", "are", "were", "more", "most",
  "very", "so", "than", "by", "from", "into", "if", "when", "while", "what",
]);

// Game industry tropes Yahtzee loves to hate
const PET_PEEVES: { label: string; pattern: RegExp }[] = [
  { label: "Boss Fights", pattern: /\bboss fight/g },
  { label: "Open World", pattern: /\bopen[ -]world/g },
  { label: "Crafting", pattern: /\bcrafting\b/g },
  { label: "Minigames", pattern: /\bmini[ -]?games?\b/g },
  { label: "Quick-Time Events", pattern: /\bquick[ -]?time event|\bqtes?\b/g },
  { label: "Tutorials", pattern: /\btutorials?\b/g },
  { label: "Side Quests", pattern: /\bside[ -]?quest/g },
  { label: "Grinding", pattern: /\bgrinding\b/g },
  { label: "Checkpoints", pattern: /\bcheckpoints?\b/g },
  { label: "Live Service", pattern: /\blive service/g },
  { label: "DLC", pattern: /\bdlc\b/g },
  { label: "Fetch Quests", pattern: /\bfetch quest/g },
  { label: "Backtracking", pattern: /\bbacktrack/g },
  { label: "Loot Boxes", pattern: /\bloot ?box(?:es)?\b/g },
  { label: "Micropayments", pattern: /\bmicro-?payments?\b/g },
  { label: "Invisible Walls", pattern: /\binvisible wall/g },
];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
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
  const allWords = new Set<string>();
  const profanityCounts = new Map<string, number>();
  const gameMentions = new Map<string, number>();
  const seriesData = new Map<string, { count: number; words: number; duration: number }>();
  const yearlyData = new Map<number, { count: number; words: number; duration: number; swears: number }>();
  const peeveData = new Map<string, { mentions: number; videos: number }>();
  const similes: Simile[] = [];
  const darkSouls = { mentions: 0, videosMentioning: 0, actualReviews: 0 };

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

    // Build display text keeping original case, with char-index → timestamp map
    const segments: { start: number; offset: number }[] = [];
    let displayText = "";
    for (const c of data.captions) {
      const text = decodeHtmlEntities(c.text).replace(/\s+/g, " ").trim();
      if (!text) continue;
      segments.push({ start: displayText.length, offset: Math.floor(c.offset) });
      displayText += `${text} `;
    }
    const fullText = displayText.toLowerCase();

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

    // Profanity counting
    let videoSwears = 0;
    for (const profane of PROFANITY) {
      const regex = new RegExp(`\\b${profane}\\b`, "gi");
      const matches = fullText.match(regex);
      if (matches) {
        profanityCounts.set(profane, (profanityCounts.get(profane) || 0) + matches.length);
        videoSwears += matches.length;
      }
    }

    videos.push({
      id: data.video.id,
      title: cleanTitle(data.video.title),
      duration: data.video.duration,
      wordCount,
      wordsPerMinute: wpm,
      swearCount: videoSwears,
      series,
      year,
    });

    totalWords += wordCount;
    totalDuration += data.video.duration;
    totalCharacters += fullText.length;

    // Yearly breakdown
    if (year) {
      const yearData = yearlyData.get(year) || { count: 0, words: 0, duration: 0, swears: 0 };
      yearData.count++;
      yearData.words += wordCount;
      yearData.duration += data.video.duration;
      yearData.swears += videoSwears;
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
      allWords.add(word);
      if (!STOP_WORDS.has(word) && word.length > 3) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Simile extraction with timestamps
    for (const match of displayText.matchAll(SIMILE_REGEX)) {
      if (SIMILE_BAD_START.test(match[0])) continue;
      const lastWord = match[0].split(" ").at(-1)!.toLowerCase().replace(/[’']s?$/, "");
      if (SIMILE_BAD_ENDINGS.has(lastWord)) continue;
      let timestamp = 0;
      for (const seg of segments) {
        if (seg.start > match.index) break;
        timestamp = seg.offset;
      }
      similes.push({
        text: match[0],
        videoId: data.video.id,
        videoTitle: cleanTitle(data.video.title),
        t: timestamp,
      });
    }

    // Pet peeve tracking
    for (const peeve of PET_PEEVES) {
      const matches = fullText.match(peeve.pattern);
      if (matches) {
        const entry = peeveData.get(peeve.label) || { mentions: 0, videos: 0 };
        entry.mentions += matches.length;
        entry.videos++;
        peeveData.set(peeve.label, entry);
      }
    }

    // The Dark Souls running gag: mentions in videos that aren't about Dark Souls
    if (data.video.title.toLowerCase().includes("dark souls")) {
      darkSouls.actualReviews++;
    } else {
      const dsMatches = fullText.match(/dark souls/g);
      if (dsMatches) {
        darkSouls.mentions += dsMatches.length;
        darkSouls.videosMentioning++;
      }
    }

    // Game mentions (use word boundaries to avoid false positives like metroid/metroidvania)
    for (const game of GAME_KEYWORDS) {
      const escaped = game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      if (regex.test(fullText)) {
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
      swearsPer1000Words: Math.round((data.swears / data.words) * 1000 * 10) / 10,
    }));

  console.log(`Yearly data available for ${yearlyStats.length} years`);
  console.log(`Extracted ${similes.length} similes`);

  // Find extremes
  const byDuration = [...videos].sort((a, b) => b.duration - a.duration);
  const byWords = [...videos].sort((a, b) => b.wordCount - a.wordCount);
  const byWpm = [...videos].filter((v) => v.duration > 60).sort((a, b) => b.wordsPerMinute - a.wordsPerMinute);

  const bySwearRate = videos
    .filter((v) => v.duration > 120)
    .map((v) => ({
      title: v.title,
      id: v.id,
      count: v.swearCount,
      perMinute: Math.round((v.swearCount / (v.duration / 60)) * 10) / 10,
    }))
    .sort((a, b) => b.perMinute - a.perMinute);

  const sweariestEpisodes = bySwearRate.slice(0, 5);
  const cleanest = [...bySwearRate].sort((a, b) => a.count - b.count)[0];

  // Vocabulary: hapax legomena = words said exactly once in 17 years
  const hapaxWords = [...wordCounts.entries()]
    .filter(([word, count]) => count === 1 && /^[a-z]{7,}$/.test(word) && !/(.)\1\1/.test(word))
    .map(([word]) => word)
    .sort();
  const hapaxStride = Math.max(1, Math.floor(hapaxWords.length / 24));
  const hapaxSample = hapaxWords.filter((_, i) => i % hapaxStride === 0).slice(0, 24);

  // Cap stored similes; the page picks randomly client-side
  const simileStride = Math.max(1, Math.ceil(similes.length / 300));
  const selectedSimiles = similes.filter((_, i) => i % simileStride === 0);

  // Compute fun facts
  const allFWords = (profanityCounts.get("fuck") || 0) + (profanityCounts.get("fucking") || 0) +
    (profanityCounts.get("fucked") || 0) + (profanityCounts.get("fucker") || 0) +
    (profanityCounts.get("fucks") || 0);
  const totalSwears = [...profanityCounts.values()].reduce((sum, c) => sum + c, 0);

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
      label: "Expletive frequency",
      value: `One every ${Math.round(totalDuration / totalSwears)} seconds of runtime`,
    },
    {
      label: "Similes committed",
      value: `${similes.length.toLocaleString()}+ on record (one every ${Math.round(totalDuration / similes.length)} seconds)`,
    },
    {
      label: "Binge watch time",
      value: `${Math.round(totalHours / 24)} days non-stop`,
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

    similes: selectedSimiles,
    totalSimiles: similes.length,
    totalSwears,
    sweariestEpisodes,
    cleanestEpisode: cleanest,
    petPeeves: PET_PEEVES.map((p) => ({
      label: p.label,
      mentions: peeveData.get(p.label)?.mentions || 0,
      videos: peeveData.get(p.label)?.videos || 0,
    })).sort((a, b) => b.mentions - a.mentions),
    darkSouls,
    vocabulary: {
      uniqueWords: allWords.size,
      hapaxCount: hapaxWords.length,
      hapaxSample,
    },
  };

  // Ensure output directory exists
  const outputDir = join(import.meta.dir, "../src/data");
  await Bun.write(join(outputDir, ".gitkeep"), "");
  await Bun.write(OUTPUT_PATH, JSON.stringify(stats, null, 2));

  console.log(`Stats computed for ${videos.length} videos`);
  console.log(`Output written to ${OUTPUT_PATH}`);
}

main().catch(console.error);
