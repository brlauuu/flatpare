// The hero's background (#301): a faint pencil sketch of a city map —
// wobbly streets, a river, hand-circled spots in the accent colour and a few
// handwritten notes. Purely decorative, so hidden from assistive technology
// and from the pointer. The marks keep to the edges so the text stays
// readable. Shown from `lg` up only: below that the hero stacks into one tall
// column, `slice` scales the drawing to the height, and the marks land on
// the headline instead of around it.
const NOTES = [
  { x: 200, y: 58, r: -6, text: "balcony!" },
  { x: 672, y: 44, r: 4, text: "near the tram" },
  { x: 1000, y: 738, r: -4, text: "our favourite" },
  { x: 632, y: 742, r: 3, text: "too dark?" },
  { x: 760, y: 694, r: -8, text: "12 min by bike", size: 20 },
] as const;

export function HeroSketch() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1280 760"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
    >
      {/* The river. */}
      <path
        d="M -40 470 C 160 430, 330 520, 520 500 S 860 430, 1000 520 S 1220 600, 1320 560"
        fill="none"
        stroke="var(--lp-map-ink)"
        strokeOpacity="0.05"
        strokeWidth="30"
        strokeLinecap="round"
      />
      {/* Streets. */}
      <g fill="none" stroke="var(--lp-map-ink)" strokeOpacity="0.14" strokeWidth="1.6" strokeLinecap="round">
        <path d="M -20 182 C 200 172, 420 204, 640 186 S 1100 168, 1300 194" />
        <path d="M -20 196 C 210 188, 430 216, 650 199" />
        <path d="M 262 -20 C 250 200, 276 420, 256 780" />
        <path d="M 904 -20 C 918 260, 890 500, 906 780" />
        <path d="M -20 640 C 300 580, 700 662, 1300 540" />
        <path d="M 520 -20 C 560 120, 610 160, 700 260" />
        <path d="M 1040 300 C 1110 330, 1180 330, 1300 310" />
      </g>
      {/* Circled spots: a house, a star, a heart, a crossed-out one. */}
      <g
        fill="none"
        stroke="var(--lp-map-mark)"
        strokeOpacity="0.65"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 118 66 C 118 40, 178 36, 188 62 C 198 88, 150 104, 126 92 C 110 84, 114 64, 134 56" />
        <path d="M 614 56 L 620 42 L 626 56 L 640 56 L 629 65 L 633 79 L 620 71 L 607 79 L 611 65 L 600 56 Z" />
        <path d="M 586 50 C 590 24, 650 22, 660 48 C 668 74, 628 92, 600 82 C 584 76, 582 60, 596 52" />
        <path d="M 1158 650 C 1150 620, 1220 610, 1232 640 C 1244 672, 1196 690, 1170 678 C 1150 668, 1150 648, 1166 640" />
        <path d="M 1196 660 C 1186 648, 1172 656, 1182 668 L 1196 680 L 1210 668 C 1220 656, 1206 648, 1196 660 Z" />
        <path d="M 586 690 L 614 718 M 614 690 L 586 718" />
        <path d="M 1130 716 C 1150 712, 1160 700, 1164 688 M 1154 692 L 1164 686 L 1168 698" />
      </g>
      {/* The dotted route between two spots. */}
      <path
        d="M 624 704 C 760 764, 980 600, 1150 650"
        fill="none"
        stroke="var(--lp-map-mark)"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      <path
        d="M 140 76 L 152 64 L 164 76 M 144 74 V 86 H 160 V 74"
        fill="none"
        stroke="var(--lp-map-ink)"
        strokeOpacity="0.4"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <g fill="var(--lp-map-ink)" fillOpacity="0.45" style={{ fontFamily: "var(--font-caveat), cursive" }} fontWeight="700">
        {NOTES.map((n) => (
          <text
            key={n.text}
            x={n.x}
            y={n.y}
            fontSize={"size" in n ? n.size : 26}
            transform={`rotate(${n.r} ${n.x} ${n.y})`}
          >
            {n.text}
          </text>
        ))}
      </g>
    </svg>
  );
}
