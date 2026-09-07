// The stylised world map from the live-visitors design. Paths are copied verbatim from the
// design source rather than redrawn -- it is a decorative illustration, not a projection, and
// the shapes carry the designer's intent (an emphasised Arabian Peninsula, a marked Riyadh).
//
// Deliberately not data-driven: the design highlights the Gulf statically, and there is no
// country-geometry mapping in this codebase to colour arbitrary countries by visitor count.
// The real per-country numbers live in the bar list beside it (see LiveVisitorsPage), which is
// where the actual data is read.
export function WorldMapIllustration() {
  return (
    <svg
      viewBox="0 0 700 360"
      className="block h-auto w-full min-h-[180px]"
      role="img"
      aria-label="خريطة توضيحية لتوزيع الزوار"
    >
      <rect width="700" height="360" fill="#e8f0fb" rx="10" />

      {/* Greenland */}
      <path
        d="M 192,8 C 208,4 238,6 252,18 C 264,30 260,50 244,58 C 226,66 202,58 192,44 C 182,30 182,14 192,8 Z"
        fill="#cdddf0"
      />

      {/* North America */}
      <path
        d="M 52,42 C 70,32 108,28 148,34 C 175,38 200,52 214,72 C 226,90 228,116 220,140 C 212,162 196,178 174,186 C 150,194 124,190 104,176 C 82,160 66,136 58,108 C 50,80 46,56 52,42 Z"
        fill="#c2d6ee"
      />
      <path
        d="M 128,188 C 138,194 148,202 152,218 C 154,228 148,236 140,234 C 130,230 120,218 116,206 C 112,194 120,184 128,188 Z"
        fill="#c2d6ee"
      />

      {/* South America */}
      <path
        d="M 150,216 C 168,208 194,210 210,224 C 226,238 232,266 228,294 C 224,320 212,342 196,352 C 178,360 158,350 146,334 C 132,314 126,286 128,260 C 130,234 138,220 150,216 Z"
        fill="#c2d6ee"
      />

      {/* Europe */}
      <path
        d="M 316,30 C 336,20 374,18 406,28 C 428,36 440,54 436,74 C 430,96 410,108 386,112 C 360,116 334,104 320,86 C 306,68 302,44 316,30 Z"
        fill="#c2d6ee"
      />
      <path
        d="M 308,88 C 316,96 320,110 314,118 C 308,124 298,120 294,110 C 290,100 296,88 308,88 Z"
        fill="#c2d6ee"
      />
      <path
        d="M 374,18 C 388,10 410,8 424,18 C 434,26 430,42 418,48 C 406,30 392,24 374,18 Z"
        fill="#c2d6ee"
      />

      {/* Africa */}
      <path
        d="M 330,108 C 360,96 402,94 428,106 C 452,118 464,146 462,178 C 460,212 444,252 424,284 C 402,318 376,336 352,332 C 326,328 308,304 300,272 C 292,238 294,196 304,162 C 314,130 318,116 330,108 Z"
        fill="#c2d6ee"
      />
      <path
        d="M 460,180 C 475,175 492,178 498,190 C 502,200 494,212 480,214 C 466,214 456,202 460,180 Z"
        fill="#c2d6ee"
      />

      {/* Middle East */}
      <path
        d="M 430,90 C 458,80 500,80 530,96 C 554,110 562,136 552,158 C 540,182 514,194 486,190 C 462,186 442,170 434,148 C 426,126 424,100 430,90 Z"
        fill="#a8c4e0"
      />
      <path
        d="M 442,110 C 460,102 492,104 510,118 C 524,130 524,152 512,166 C 498,180 474,184 454,172 C 434,158 430,136 436,120 C 438,114 440,112 442,110 Z"
        fill="#5a96d4"
        opacity="0.85"
      />
      <circle cx="478" cy="142" r="5" fill="#2563eb" opacity="0.95" />
      <circle cx="478" cy="142" r="9" fill="#2563eb" opacity="0.2" />

      {/* Egypt */}
      <path
        d="M 388,108 C 406,102 428,108 434,124 C 438,138 428,152 412,154 C 394,156 380,142 382,124 C 383,116 386,110 388,108 Z"
        fill="#7bafd8"
        opacity="0.7"
      />
      <circle cx="406" cy="130" r="3.5" fill="#3b82f6" opacity="0.85" />
      <circle cx="518" cy="138" r="3" fill="#60a5fa" opacity="0.8" />

      {/* Asia */}
      <path
        d="M 528,28 C 566,16 622,14 668,24 C 696,32 700,56 698,84 C 696,114 676,140 646,154 C 614,168 574,170 542,158 C 514,146 498,122 502,96 C 506,68 518,38 528,28 Z"
        fill="#c2d6ee"
      />
      <path
        d="M 548,156 C 568,150 594,152 608,166 C 618,178 616,198 602,208 C 586,218 564,214 552,200 C 540,186 536,164 548,156 Z"
        fill="#c2d6ee"
      />
      <path
        d="M 614,158 C 636,150 662,152 674,168 C 682,180 678,198 662,206 C 644,214 622,206 614,190 C 608,176 608,164 614,158 Z"
        fill="#c2d6ee"
      />

      {/* Australia */}
      <path
        d="M 586,232 C 618,220 660,222 682,240 C 700,256 702,284 690,304 C 676,326 646,334 616,326 C 584,316 566,290 568,264 C 570,242 578,236 586,232 Z"
        fill="#c2d6ee"
      />
    </svg>
  )
}
