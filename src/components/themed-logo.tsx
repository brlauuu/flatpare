import Image from "next/image";

// The wordmark, one image per theme: blue on light, yellow on dark (#323).
// The landing page, the nav bar and the sign-in card all show this pair;
// `flatpare_logo.svg` stays only as the source the PWA icons are cut from.
// `className` sizes both images (e.g. "h-8 w-auto").
export function ThemedLogo({
  className,
  width,
  height,
  priority = false,
}: {
  className: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src="/flatpare_logo_blue.svg"
        alt="Flatpare"
        width={width}
        height={height}
        className={`${className} dark:hidden`}
        priority={priority}
      />
      <Image
        src="/flatpare_logo_yellow.svg"
        alt="Flatpare"
        width={width}
        height={height}
        className={`${className} hidden dark:block`}
        priority={priority}
      />
    </>
  );
}
