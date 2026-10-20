import { useTranslations } from "next-intl";

// The landing page's pencil sketches (#301, more places in #326): a faint
// city map drawn by hand — wobbly streets, a river, a tram line, mock flats
// circled in the accent colour and a few handwritten notes. Purely
// decorative, so hidden from assistive technology and from the pointer. The
// marks keep to the edges so the text stays readable.
//
// Drawn at a fixed scale, one unit to one pixel, 1920 wide and centred on
// the page: the 1280-unit middle (x 0–1280) lines up with the 1160px content
// column at every width, and the sides (x -320–0 and 1280–1600) only show on
// wide screens. Scaled to the window instead, a 1920px screen showed only
// the middle band of the hero and cropped every mark away (#326). Shown from
// `xl` up only: below 1280px the hero's content reflows and any fixed
// drawing lands on the headline.
//
// The hero's marks sit in two bands pinned to its top and bottom edges
// (HeroSketch), so they hold their place when a translated headline wraps
// and the hero grows. Keep each mark inside its band's viewBox.
//
// No prices in here: the SVG text is page text, and the landing test that
// every "CHF <n>" on the page is "CHF 5" would rightly fail on a mock rent.

// `text` names the note in messages/<locale>/landing.json (`sketch.*`).
type Note = { x: number; y: number; r: number; text: SketchNote; size?: number };
type SketchNote =
  | "balcony" | "tram" | "favourite" | "tooDark" | "byBike" | "flatA" | "work"
  | "flatC" | "flatD" | "flatE" | "flatB" | "viewing" | "tape" | "decided";

const STREET = {
  fill: "none",
  stroke: "var(--lp-map-ink)",
  strokeOpacity: 0.14,
  strokeWidth: 1.6,
  strokeLinecap: "round",
} as const;

const MARK = {
  fill: "none",
  stroke: "var(--lp-map-mark)",
  strokeOpacity: 0.65,
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ROUTE = {
  fill: "none",
  stroke: "var(--lp-map-mark)",
  strokeOpacity: 0.45,
  strokeWidth: 2,
  strokeDasharray: "2 9",
  strokeLinecap: "round",
} as const;

// A loose pencil loop around a spot, open where the pencil lifted.
function loop(cx: number, cy: number, rx = 34, ry = 26) {
  return (
    `M ${cx - rx + 4} ${cy + 2} ` +
    `C ${cx - rx} ${cy - ry}, ${cx + rx - 6} ${cy - ry - 4}, ${cx + rx} ${cy - 4} ` +
    `C ${cx + rx + 6} ${cy + ry}, ${cx - rx / 2} ${cy + ry + 4}, ${cx - rx + 8} ${cy + ry / 2} ` +
    `C ${cx - rx - 2} ${cy + 4}, ${cx - rx + 2} ${cy - 10}, ${cx - rx + 18} ${cy - ry + 6}`
  );
}

function Notes({ notes }: { notes: readonly Note[] }) {
  const t = useTranslations("landing.sketch");
  return (
    <g fill="var(--lp-map-ink)" fillOpacity="0.45" style={{ fontFamily: "var(--font-caveat), cursive" }} fontWeight="700">
      {notes.map((n) => (
        <text key={n.text} x={n.x} y={n.y} fontSize={n.size ?? 26} transform={`rotate(${n.r} ${n.x} ${n.y})`}>
          {t(n.text)}
        </text>
      ))}
    </g>
  );
}

// A circled letter: how the mock flats are marked on both sketches.
function Flat({ x, y, letter }: { x: number; y: number; letter: string }) {
  return (
    <g>
      <path d={loop(x, y, 24, 20)} {...MARK} />
      <text
        x={x}
        y={y + 9}
        textAnchor="middle"
        fontSize="28"
        fontWeight="700"
        fill="var(--lp-map-mark)"
        fillOpacity="0.75"
        style={{ fontFamily: "var(--font-caveat), cursive" }}
      >
        {letter}
      </text>
    </g>
  );
}

const SKETCH_CLASS = "pointer-events-none absolute left-1/2 hidden w-[1920px] max-w-none -translate-x-1/2 xl:block";

// The marks are split by the edge they belong to, so they keep their place
// beside the text whatever height the hero takes: it grows when a headline
// wraps (German, French and Italian wrap to four lines, #288). Each band's
// viewBox starts where the centred drawing used to show it at the English
// hero's 672px (y 44 and y 716), so English renders as before.
const HERO_TOP_NOTES: readonly Note[] = [
  { x: 200, y: 82, r: -6, text: "balcony" },
  { x: 672, y: 72, r: 4, text: "tram" },
  { x: 936, y: 100, r: -3, text: "flatA", size: 22 },
  { x: 1104, y: 150, r: 4, text: "work", size: 20 },
  // The sides, wide screens only.
  { x: -250, y: 330, r: -4, text: "flatD", size: 22 },
];

const HERO_BOTTOM_NOTES: readonly Note[] = [
  { x: 1002, y: 704, r: -4, text: "favourite" },
  { x: 566, y: 658, r: 3, text: "tooDark", size: 22 },
  { x: 760, y: 676, r: -8, text: "byBike", size: 20 },
  { x: 160, y: 694, r: 3, text: "flatC", size: 22 },
  { x: 1346, y: 420, r: 4, text: "flatE", size: 22 },
];

const HERO_TOP_VIEWBOX = "-320 44 1920 380";
const HERO_BOTTOM_VIEWBOX = "-320 336 1920 380";

export function HeroSketch() {
  return (
    <>
      {/* The map: river and streets, centred — they run edge to edge. */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="-320 0 1920 760"
        preserveAspectRatio="xMidYMid slice"
        className={`${SKETCH_CLASS} top-0 h-full`}
      >
        <path
          d="M -360 450 C -160 500, -20 440, 160 450 C 330 470, 330 520, 520 500 S 860 430, 1000 520 S 1220 600, 1360 560 S 1560 500, 1640 520"
          fill="none"
          stroke="var(--lp-map-ink)"
          strokeOpacity="0.05"
          strokeWidth="30"
          strokeLinecap="round"
        />
        <g {...STREET}>
          <path d="M -340 170 C -120 190, 40 176, 200 174 C 330 178, 420 204, 640 186 S 1100 168, 1300 194 S 1520 210, 1620 186" />
          <path d="M -20 196 C 210 188, 430 216, 650 199" />
          <path d="M -160 -20 C -180 200, -140 460, -170 780" />
          <path d="M 1440 -20 C 1420 240, 1460 480, 1436 780" />
          <path d="M 262 -20 C 250 200, 276 420, 256 780" />
          <path d="M 904 -20 C 918 260, 890 500, 906 780" />
          <path d="M -340 600 C -120 660, 60 610, 300 600 C 500 600, 700 662, 1300 540 S 1520 520, 1620 560" />
          <path d="M 520 -20 C 560 120, 610 160, 700 260" />
          <path d="M 1040 300 C 1110 330, 1180 330, 1300 310 S 1520 280, 1620 320" />
          <path d="M 760 -20 C 780 60, 830 110, 904 130" />
          <path d="M -340 690 C -100 720, 120 690, 260 712 S 380 704, 420 704" />
        </g>
      </svg>
      {/* The top edge's marks. */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={HERO_TOP_VIEWBOX}
        preserveAspectRatio="xMidYMin slice"
        className={`${SKETCH_CLASS} top-0 h-[380px]`}
      >
        {/* The tram line, near the note that mentions it: a track with ties. */}
        <g fill="none" stroke="var(--lp-map-ink)" strokeOpacity="0.16">
          <path d="M 330 136 C 450 120, 560 132, 700 112 S 900 90, 1010 128" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 330 136 C 450 120, 560 132, 700 112 S 900 90, 1010 128" strokeWidth="8" strokeDasharray="1.4 13" />
        </g>
        {/* A circled house and a star. */}
        <g {...MARK}>
          <path d="M 118 90 C 118 64, 178 60, 188 86 C 198 112, 150 128, 126 116 C 110 108, 114 88, 134 80" />
          <path d="M 614 78 L 620 64 L 626 78 L 640 78 L 629 87 L 633 101 L 620 93 L 607 101 L 611 87 L 600 78 Z" />
          <path d="M 586 72 C 590 46, 650 44, 660 70 C 668 96, 628 114, 600 104 C 584 98, 582 82, 596 74" />
        </g>
        <path
          d="M 140 100 L 152 88 L 164 100 M 144 98 V 110 H 160 V 98"
          fill="none"
          stroke="var(--lp-map-ink)"
          strokeOpacity="0.4"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <Flat x={904} y={92} letter="A" />
        <Flat x={-284} y={322} letter="D" />
        {/* Work, with the commute rings drawn loosely around it. */}
        <g fill="none" stroke="var(--lp-map-mark)" strokeOpacity="0.3" strokeWidth="1.6" strokeDasharray="5 7" strokeLinecap="round">
          <path d={loop(1196, 108, 30, 24)} />
          <path d={loop(1196, 108, 58, 46)} />
        </g>
        <path d="M 1184 104 H 1208 V 120 H 1184 Z M 1190 104 V 98 H 1202 V 104" {...MARK} strokeWidth={1.8} />
        <Notes notes={HERO_TOP_NOTES} />
      </svg>
      {/* The bottom edge's marks. */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={HERO_BOTTOM_VIEWBOX}
        preserveAspectRatio="xMidYMax slice"
        className={`${SKETCH_CLASS} bottom-0 h-[380px]`}
      >
        {/* A heart, a crossed-out spot, and the dotted route between them. */}
        <g {...MARK}>
          <path d="M 1158 630 C 1150 600, 1220 590, 1232 620 C 1244 652, 1196 670, 1170 658 C 1150 648, 1150 628, 1166 620" />
          <path d="M 1196 640 C 1186 628, 1172 636, 1182 648 L 1196 660 L 1210 648 C 1220 636, 1206 628, 1196 640 Z" />
          <path d="M 586 668 L 614 696 M 614 668 L 586 696" />
          <path d="M 1130 696 C 1150 692, 1160 680, 1164 668 M 1154 672 L 1164 666 L 1168 678" />
        </g>
        <path d="M 624 684 C 760 744, 980 580, 1150 630" {...ROUTE} />
        <Flat x={128} y={686} letter="C" />
        <Flat x={1312} y={412} letter="E" />
        <Notes notes={HERO_BOTTOM_NOTES} />
      </svg>
    </>
  );
}

const INSIDE_NOTES: readonly Note[] = [
  { x: 676, y: 92, r: -4, text: "flatB", size: 24 },
  { x: 1026, y: 80, r: 4, text: "viewing", size: 22 },
  { x: 1016, y: 104, r: 4, text: "tape", size: 18 },
];

// The "What's inside" section's top band (#326): the hunt from the hero,
// a step further on. Sits in the space right of the heading; the band is
// 1280 × 170 units, anchored to the top of the section.
export function InsideSketch() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-320 0 1920 170"
      preserveAspectRatio="xMidYMin slice"
      className={`${SKETCH_CLASS} top-0 h-[170px]`}
    >
      <g {...STREET}>
        <path d="M 400 30 C 560 50, 740 20, 900 44 S 1160 60, 1300 40 S 1520 20, 1620 44" />
        <path d="M 820 -20 C 830 50, 812 110, 826 190" />
        <path d="M 1236 -20 C 1246 60, 1262 120, 1254 190" />
        <path d="M 440 150 C 600 136, 760 160, 960 140" />
      </g>
      <Flat x={636} y={84} letter="B" />
      <path d="M 636 116 C 632 108, 622 112, 628 120 L 636 128 L 644 120 C 650 112, 640 108, 636 116 Z" {...MARK} strokeWidth={1.8} />
      <path d="M 900 100 C 930 126, 960 116, 984 96" {...ROUTE} />
      <path d={loop(1090, 88, 100, 42)} fill="none" stroke="var(--lp-map-ink)" strokeOpacity="0.2" strokeWidth="1.6" strokeLinecap="round" />
      <Notes notes={INSIDE_NOTES} />
    </svg>
  );
}

const DECIDED_NOTES: readonly Note[] = [{ x: 1000, y: 74, r: -5, text: "decided", size: 26 }];

// And the end of the story, in the space under the big comparison grid.
export function DecidedSketch() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-320 0 1920 100"
      preserveAspectRatio="xMidYMax slice"
      className={`${SKETCH_CLASS} bottom-0 h-[100px]`}
    >
      <g {...STREET}>
        <path d="M -340 52 C -120 70, 60 44, 200 54 C 300 58, 420 74, 640 58 S 1000 40, 1300 66 S 1520 76, 1620 54" />
      </g>
      <path d="M 300 64 C 520 90, 760 30, 960 62" {...ROUTE} />
      <path d="M 968 56 L 978 68 L 994 42" {...MARK} strokeWidth={2.6} />
      <Notes notes={DECIDED_NOTES} />
    </svg>
  );
}
