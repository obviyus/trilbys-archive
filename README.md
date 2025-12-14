# Trilby's Archive

A searchable archive of every Zero Punctuation and Fully Ramblomatic video transcript. Search for any quote, game, or phrase and jump directly to that moment on YouTube.

## How It Works

### Transcript Pipeline

Getting captions for 700+ videos required a multi-step fallback approach:

1. **YouTube Transcript API** - First attempt using the `youtube-transcript` library to pull existing captions directly from YouTube (fastest)
2. **yt-dlp Subtitles** - If no captions available via API, fall back to downloading auto-generated subtitles via `yt-dlp`
3. **Whisper Transcription** - For videos with no captions at all, download the audio and transcribe using `whisper-large-v3` via Groq's API

### Tech Stack

- **[Astro](https://astro.build)** - Static site generator (no React, no Tailwind)
- **[Pagefind](https://pagefind.app)** - Client-side full-text search index
- **[Bun](https://bun.sh)** - Runtime and package manager

## Development

```bash
# Install dependencies
bun install

# First-time setup: build search index and copy to public
bun run dev:setup

# Start dev server
bun run dev
```

## Data Pipeline Scripts

```bash
# Fetch captions from YouTube playlists
bun run captions

# Transcribe failed videos using Groq Whisper
GROQ_API_KEY=xxx bun run transcribe --limit 10
```

### Full Build

```bash
bun run build
```

This runs the complete pipeline:
1. Generate Astro pages for each video
2. Build caption JSON index
3. Calculate the stats
4. Build Astro site
5. Generate Pagefind search index

## Requirements

- [Bun](https://bun.sh)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - `brew install yt-dlp`
- [ffmpeg](https://ffmpeg.org) - Required for audio extraction (Whisper fallback)
- `GROQ_API_KEY` environment variable for Whisper transcription

## Acknowledgments

Thank you, Yahtzee Croshaw, for nearly two decades of some of the best video game critique on the internet.

No affiliation with The Escapist or Second Wind.
