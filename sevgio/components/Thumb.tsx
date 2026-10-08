import type { ThumbName } from "@/lib/thumbs.ts";

/** A small rounded photo that stands in for a category, amenity, service or audience icon. Decorative: the label beside it says what it is. */
export function Thumb({ name, size = 32, className = "" }: { name: ThumbName; size?: number; className?: string }) {
  return <img src={`/img/thumbs/${name}.webp`} width={size} height={size} alt="" loading="lazy" decoding="async" className={`thumb${className ? " " + className : ""}`} />;
}
