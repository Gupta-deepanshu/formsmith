"use client";

import { useMemo, useSyncExternalStore } from "react";
import { DotField } from "./DotField";
import MoltenMetal from "./MoltenMetal";

/**
 * Landing hero background: React Bits' Molten Metal shader, tuned to our design system.
 *
 * - Colours come from our `--accent*` tokens, not the component's violet/pink defaults, so
 *   the page still has one accent. The shader needs plain sRGB colours and our tokens are
 *   oklch, so each token is painted into a 1×1 canvas and read back as hex.
 * - Follows the theme: the `.dark` class on <html> is watched, and light mode switches the
 *   shader's `lightMode` (ink on paper instead of glow on black) and a darker palette.
 * - Kept quiet so text stays readable (the reason the Kokonut dot field was dropped): low
 *   opacity, faded out towards the bottom, and dimmed further behind the headline.
 * - No WebGL2 (old browsers, some locked-down machines): falls back to the CSS dot grid.
 *   On the server neither is rendered, so markup can't mismatch on hydration.
 * - Reduced motion, off-screen pausing, DPR capping and GPU cleanup are handled inside
 *   MoltenMetal itself.
 */

let webgl2: boolean | undefined;
function hasWebGL2() {
  if (webgl2 === undefined) {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl2 = gl != null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return webgl2;
}
const never = () => () => {};

function subscribeTheme(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const currentTheme = () =>
  document.documentElement.classList.contains("dark") ? ("dark" as const) : ("light" as const);

let probe: CanvasRenderingContext2D | null = null;
let swatch: HTMLSpanElement | null = null;
/**
 * Resolve any CSS colour expression, including var() and color-mix() over our oklch tokens,
 * to #rrggbb. The browser resolves it as an element's `color`, then we paint that into a
 * 1×1 canvas and read the pixel back (canvas pixels are always sRGB).
 */
function cssHex(expression: string) {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!swatch) {
    swatch = document.createElement("span");
    swatch.hidden = true;
    document.body.appendChild(swatch);
  }
  swatch.style.color = "";
  swatch.style.color = expression;
  const value = getComputedStyle(swatch).color;
  if (!probe || !value) return "#6366f1";
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

// Faded towards the bottom, and dimmed (to 30%) in an ellipse behind the headline.
const MASK =
  "linear-gradient(to bottom, #000 45%, transparent 95%), radial-gradient(ellipse 42% 15% at 50% 27%, rgb(0 0 0 / 0.3), #000 100%)";

export function HeroBackground() {
  const supported = useSyncExternalStore(never, hasWebGL2, () => null);
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);

  const look = useMemo(() => {
    if (!theme) return null;
    const accent = cssHex("var(--accent)");
    // Crisp strands need a high-contrast core (the original's is pure white). Ours stays in
    // the accent hue: a near-white tint on dark, a near-black shade on light.
    return theme === "dark"
      ? // Glow on dark: deep accent at a strand's edge, near-white accent at its core.
        {
          colors: [cssHex("var(--accent-soft)"), accent],
          core: cssHex("color-mix(in oklch, var(--accent) 22%, white)"),
          light: false,
          opacity: 0.75,
        }
      : // Ink on light paper: accent strands with deep, near-black accent cores.
        {
          colors: [accent, cssHex("var(--accent-strong)")],
          core: cssHex("color-mix(in oklch, var(--accent-strong) 55%, black)"),
          light: true,
          opacity: 0.55,
        };
  }, [theme]);

  if (supported === null || !look) return null;

  if (!supported) {
    return <DotField className="absolute inset-x-0 top-0 -z-10 mx-auto h-[34rem] max-w-4xl" />;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]"
      style={{ maskImage: MASK, maskComposite: "intersect" }}
    >
      <MoltenMetal
        colors={look.colors}
        coreColor={look.core}
        lightMode={look.light}
        opacity={look.opacity}
        brightness={1.1}
        // Full 2× like the original: rendering below the screen's pixel ratio and letting
        // the browser upscale is what made the strands look soft.
        dpr={2}
      />
    </div>
  );
}
