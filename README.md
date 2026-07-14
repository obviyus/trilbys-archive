# Trilby's Archive

Every *Zero Punctuation* and *Fully Ramblomatic* transcript, searchable. Find any quote, game, or phrase across **959 videos** of Yahtzee Croshaw's fast-talking critique — and jump straight to that moment on YouTube.

Nearly two decades of reviews, indexed down to the line.

## How it works

### Getting the transcripts

959 videos of rapid-fire narration need a three-tier fallback:

1. **YouTube Transcript API** — pull existing captions directly (fastest)
2. **yt-dlp subtitles** — fall back to auto-generated subtitles
3. **Whisper** — for videos with no captions at all, download the audio and transcribe with `whisper-large-v3` via Groq (the video title is fed in as a prompt, so game-specific vocabulary comes out right)

### Then what

Every transcript becomes a static Astro page, and search is entirely client-side via Pagefind — no server, no query round-trips. Because the whole corpus is text, there's also a data-mined **stats page**: profanity trends, a "sweariest vs cleanest episode" leaderboard, simile roulette, vocabulary and pet-peeve analytics.

### Stack

- **[Astro](https://astro.build)** — static site generator (deliberately no React, no Tailwind)
- **[Pagefind](https://pagefind.app)** — client-side full-text search
- **[Bun](https://bun.sh)** — runtime and package manager

## Develop

```bash
bun install
bun run dev:setup    # first time: full build + copy search index into public/
bun run dev
```

## Data pipeline

```bash
bun run captions                                  # grab captions from the YouTube playlists
GROQ_API_KEY=xxx bun run transcribe --limit 10    # Whisper fallback for the ones that failed
bun run build                                      # pages → captions → stats → astro → pagefind
```

## Requirements

Node ≥ 22.12.0, Bun, [yt-dlp](https://github.com/yt-dlp/yt-dlp), [ffmpeg](https://ffmpeg.org). `GROQ_API_KEY` only needed for Whisper transcription.

## Acknowledgments

Thank you, Yahtzee Croshaw, for nearly two decades of some of the best video-game critique on the internet.

No affiliation with The Escapist or Second Wind.
