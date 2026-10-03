import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge must know the theme's own utilities (#324), or an override
// like `shadow-none` on a Card only wins by luck of CSS emit order:
// - shadow-frame/button/pressed/hero are box-shadows (it would otherwise
//   read them as shadow colours and keep both);
// - title-page/title-section set size, weight, tracking and leading, so they
//   conflict with those groups in both directions.
const twMerge = extendTailwindMerge<"title">({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["frame", "button", "pressed", "hero"] }],
      title: ["title-page", "title-section"],
    },
    conflictingClassGroups: {
      title: ["font-size", "font-weight", "tracking", "leading"],
      "font-size": ["title"],
      "font-weight": ["title"],
      tracking: ["title"],
      leading: ["title"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
