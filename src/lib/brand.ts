/**
 * Single source of truth for the product name. Every wordmark, <title>, OG tag
 * and footer reads from here, so a rename is one edit.
 */
export const brand = {
  name: "Posterswarm Studio",
  /** Wordmark split so the UI can accent the suffix (see components/logo.tsx). */
  nameStem: "poster",
  nameSuffix: "swarm studio",
  tagline: "Local slideshow studio",
  description:
    "Create AI-assisted photo slideshows locally with your own API key and download the finished images.",
  /** Absolute origin used by local metadata. */
  url: "http://localhost:3000",
} as const;
