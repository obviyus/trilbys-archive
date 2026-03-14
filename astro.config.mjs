// @ts-check
import { defineConfig, fontProviders } from "astro/config";

// https://astro.build/config
export default defineConfig({
  fonts: [
    {
      name: "Playfair Display",
      cssVariable: "--font-playfair-display",
      provider: fontProviders.google(),
      weights: [400, 600, 700],
      styles: ["normal", "italic"],
      fallbacks: ["serif"],
    },
    {
      name: "Libre Baskerville",
      cssVariable: "--font-libre-baskerville",
      provider: fontProviders.google(),
      weights: [400, 700],
      styles: ["normal", "italic"],
      fallbacks: ["Georgia", "serif"],
    },
    {
      name: "Special Elite",
      cssVariable: "--font-special-elite",
      provider: fontProviders.google(),
      weights: [400],
      styles: ["normal"],
      fallbacks: ["monospace"],
    },
  ],
});
