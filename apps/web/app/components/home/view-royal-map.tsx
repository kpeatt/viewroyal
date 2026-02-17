interface ViewRoyalMapProps {
  className?: string;
}

/**
 * Stylized SVG map of View Royal, BC showing land mass, water features,
 * major roads, and neighbourhood areas. Designed as a decorative hero
 * background — renders at low opacity over the blue gradient.
 */
export function ViewRoyalMap({ className }: ViewRoyalMapProps) {
  return (
    <svg
      viewBox="0 0 800 600"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Water background */}
      <rect width="800" height="600" fill="rgba(255,255,255,0.08)" />

      {/* Land mass — main View Royal territory */}
      <path
        d="M 60 200
           C 80 175, 120 150, 180 140
           C 220 133, 260 135, 310 142
           C 350 148, 380 155, 420 160
           C 465 168, 500 170, 540 165
           C 575 160, 600 150, 640 145
           C 680 140, 720 148, 745 170
           C 758 182, 762 200, 758 225
           C 752 250, 735 270, 715 288
           C 695 308, 680 330, 678 355
           C 676 375, 685 395, 708 415
           C 722 430, 730 445, 725 465
           C 718 480, 700 490, 670 492
           C 640 494, 610 488, 575 475
           C 545 464, 520 455, 490 450
           C 458 445, 430 446, 400 455
           C 370 465, 345 472, 315 475
           C 280 478, 250 470, 220 455
           C 195 442, 178 425, 165 405
           C 150 382, 138 355, 125 330
           C 112 308, 95 292, 75 278
           C 58 266, 52 248, 55 228
           C 57 215, 58 205, 60 200
           Z"
        fill="rgba(255,255,255,0.35)"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.5"
      />

      {/* Portage Inlet — northern water body */}
      <path
        d="M 280 165
           C 300 190, 315 215, 320 240
           C 323 258, 318 272, 305 282
           C 290 290, 272 292, 255 286
           C 240 280, 232 268, 230 252
           C 228 235, 235 215, 252 195
           C 264 180, 272 172, 280 165 Z"
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="0.8"
      />

      {/* Esquimalt Harbour — southern water body */}
      <path
        d="M 460 452
           C 480 438, 510 428, 545 425
           C 575 422, 598 428, 615 440
           C 628 450, 632 462, 628 473
           C 622 482, 608 486, 590 484"
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="0.8"
      />
      <path
        d="M 460 452
           C 480 438, 510 428, 545 425
           C 575 422, 598 428, 615 440
           C 628 450, 632 462, 628 473
           C 622 482, 608 486, 590 484
           C 565 480, 540 470, 520 465
           C 495 458, 475 455, 460 452 Z"
        fill="rgba(255,255,255,0.06)"
      />

      {/* Gorge Waterway — connecting channel */}
      <path
        d="M 690 300
           C 682 325, 678 350, 680 375
           C 682 395, 692 412, 705 425"
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1.2"
      />

      {/* Thetis Cove — western indent */}
      <path
        d="M 110 295
           C 130 285, 155 282, 168 292
           C 178 300, 180 312, 172 325
           C 165 335, 148 338, 132 332
           C 118 326, 110 312, 110 300 Z"
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="0.6"
      />

      {/* Trans-Canada Highway (Hwy 1) — major road through centre */}
      <path
        d="M 80 245
           C 120 240, 180 225, 250 218
           C 320 212, 390 215, 450 225
           C 510 235, 560 240, 620 232
           C 660 226, 700 218, 740 208"
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Old Island Highway — secondary road south of Hwy 1 */}
      <path
        d="M 135 310
           C 190 305, 250 320, 320 340
           C 380 355, 440 370, 520 378
           C 580 384, 630 375, 680 360"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Helmcken Road — north-south connector */}
      <path
        d="M 420 160 C 415 200, 408 260, 410 320 C 412 360, 418 400, 425 450"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Minor residential roads — grid texture */}
      <g stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" fill="none">
        <path d="M 200 195 C 220 220, 240 260, 235 300" />
        <path d="M 320 170 C 315 210, 318 260, 330 310" />
        <path d="M 550 180 C 548 220, 555 270, 565 320" />
        <path d="M 650 170 C 645 210, 650 260, 660 310" />
        <path d="M 160 260 C 230 255, 320 260, 400 268" />
        <path d="M 450 270 C 520 275, 590 278, 660 275" />
        <path d="M 240 350 C 310 348, 380 355, 450 365" />
        <path d="M 500 350 C 550 355, 600 345, 650 340" />
      </g>

      {/* Neighbourhood area fills — subtle zones */}
      {/* Thetis Heights — northwest */}
      <path
        d="M 100 200 C 140 180, 200 170, 250 175 C 260 200, 255 235, 240 260 C 200 275, 150 270, 115 255 C 95 240, 95 218, 100 200 Z"
        fill="rgba(255,255,255,0.06)"
      />
      {/* Helmcken — central */}
      <path
        d="M 350 160 C 410 165, 460 175, 500 188 C 505 220, 490 260, 470 290 C 430 300, 380 295, 345 280 C 330 255, 335 210, 350 160 Z"
        fill="rgba(255,255,255,0.08)"
      />
      {/* Hospital / Craigflower — east */}
      <path
        d="M 580 175 C 640 165, 700 175, 740 200 C 745 240, 730 275, 705 295 C 660 310, 610 300, 575 280 C 560 250, 565 210, 580 175 Z"
        fill="rgba(255,255,255,0.06)"
      />

      {/* Neighbourhood labels — very subtle */}
      <g
        fill="rgba(255,255,255,0.15)"
        fontSize="10"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
        textAnchor="middle"
        letterSpacing="1.5"
      >
        <text x="175" y="238">THETIS</text>
        <text x="175" y="250">HEIGHTS</text>
        <text x="425" y="238">HELMCKEN</text>
        <text x="650" y="240">CRAIGFLOWER</text>
        <text x="350" y="410">SHORELINE</text>
        <text x="580" y="420">HOSPITAL</text>
      </g>
    </svg>
  );
}
