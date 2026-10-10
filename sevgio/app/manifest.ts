import type { MetadataRoute } from "next";

/** Lets phones show the Sevgio house when the site is added to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sevgio",
    short_name: "Sevgio",
    description: "Cozy private rooms and whole houses in Pittsburgh, booked direct with your hosts.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#14393F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
