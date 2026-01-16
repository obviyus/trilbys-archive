#!/usr/bin/env bash
set -euo pipefail

# AIDEV-NOTE: Full deployment script for yahtzee-search
# Flow: fetch video list -> grab captions -> fallback transcription (whisper) -> build -> deploy

echo "=== Yahtzee Search Deploy Script ==="
echo ""

# Step 1: Fetch video list and grab captions (youtube-transcript + yt-dlp fallback)
echo "[1/4] Fetching video list and grabbing captions..."
bun run captions

# Step 2: Transcribe failed videos with Groq Whisper (requires GROQ_API_KEY)
echo ""
echo "[2/4] Transcribing failed videos with Whisper..."
if [ -z "${GROQ_API_KEY:-}" ]; then
    echo "  GROQ_API_KEY not set, skipping whisper fallback"
else
    # Process all failed videos (remove --limit to process all)
    bun run transcribe --limit 100
fi

# Step 3: Build (pages + captions index + stats + astro + pagefind)
echo ""
echo "[3/4] Building..."
bun run build

# Step 4: Deploy to Cloudflare Pages
echo ""
echo "[4/4] Deploying to Cloudflare Pages..."
bunx wrangler pages deploy dist/

echo ""
echo "=== Done! ==="
