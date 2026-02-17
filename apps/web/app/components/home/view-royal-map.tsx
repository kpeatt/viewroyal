interface ViewRoyalMapProps {
  className?: string;
}

/**
 * Decorative SVG outline of View Royal, BC's municipal boundary.
 * Simplified representation showing the town's distinctive shape along
 * Portage Inlet (north) and Esquimalt Harbour (south), with the
 * Gorge Waterway connecting them.
 *
 * Purely decorative — rendered at very low opacity as a hero background.
 * Not geographically precise, but recognizably View Royal's silhouette.
 */
export function ViewRoyalMap({ className }: ViewRoyalMapProps) {
  return (
    <svg
      viewBox="0 0 800 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Municipal boundary outline */}
      <path
        d="M 95 280
           C 95 265, 110 245, 130 235
           C 150 225, 175 220, 195 215
           L 210 210
           C 225 200, 240 185, 260 175
           C 280 165, 310 155, 340 150
           C 365 146, 385 148, 405 152
           C 425 156, 445 164, 460 170
           L 480 178
           C 500 186, 525 190, 550 188
           C 570 186, 585 180, 600 172
           C 615 164, 630 155, 648 150
           C 668 145, 690 148, 710 158
           C 725 166, 735 178, 740 195
           C 744 210, 742 228, 735 245
           C 728 262, 715 275, 700 288
           C 688 298, 678 310, 672 325
           C 668 340, 670 355, 678 370
           C 685 382, 695 392, 705 400
           C 712 406, 718 415, 718 428
           C 718 440, 712 452, 700 460
           C 688 468, 672 472, 655 472
           C 638 472, 620 468, 600 460
           C 582 453, 565 445, 545 440
           C 525 435, 502 434, 480 436
           C 458 438, 435 444, 415 452
           C 398 459, 382 465, 365 468
           C 345 472, 325 470, 305 465
           C 285 460, 268 450, 252 438
           C 238 428, 225 415, 215 400
           C 205 385, 198 368, 190 352
           C 182 338, 170 325, 155 315
           C 140 305, 120 298, 105 292
           C 98 288, 95 285, 95 280
           Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Portage Inlet — northern waterway indentation */}
      <path
        d="M 310 168
           C 325 185, 335 200, 340 218
           C 344 232, 342 245, 335 255
           C 328 265, 318 270, 305 272
           C 290 274, 278 268, 268 258
           C 260 248, 255 235, 258 220
           C 262 205, 272 192, 288 180
           C 296 174, 303 170, 310 168"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeDasharray="4 3"
      />

      {/* Esquimalt Harbour — southern waterway */}
      <path
        d="M 480 438
           C 495 425, 510 415, 528 410
           C 545 405, 562 408, 578 415
           C 590 420, 598 428, 602 440
           C 604 450, 600 458, 592 462"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeDasharray="4 3"
      />

      {/* Gorge Waterway — connecting channel */}
      <path
        d="M 672 325
           C 665 335, 660 348, 658 362
           C 656 375, 660 388, 668 398"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinejoin="round"
        strokeDasharray="3 3"
      />

      {/* Thetis Cove area — small western indentation */}
      <path
        d="M 165 300
           C 175 295, 188 292, 198 298
           C 205 302, 208 310, 205 320
           C 202 328, 195 332, 185 330
           C 175 328, 168 318, 165 308"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinejoin="round"
        strokeDasharray="3 3"
      />
    </svg>
  );
}
