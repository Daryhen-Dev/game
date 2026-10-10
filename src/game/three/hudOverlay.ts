/**
 * HTML/CSS HUD overlay for the Three.js renderer.
 *
 * Pure DOM (no Three.js): a top strip with the energy bar and ecosystem
 * meter, and a Spanish status line. The whole overlay has
 * `pointer-events: none` so HUD taps never reach the game canvas; floating
 * scare-feedback labels are also rendered here. The end-of-level outcome
 * panel lives in the dedicated screens layer (screens.ts), not here. DOM
 * writes only happen when a displayed value actually changes (no layout
 * thrash per frame).
 */
import { statusLabel, type EcosystemMeter, type EnergyBar, type ScareFeedbackKind } from "../view/hud";

export interface HudCounts {
  safe: number;
  total: number;
}

const STYLE_ID = "hud3d-styles";

const CSS = `
.hud3d, .hud3d * {
  box-sizing: border-box;
  min-width: 0;
}
.hud3d {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  padding: calc(10px + env(safe-area-inset-top, 0px))
    calc(12px + env(safe-area-inset-right, 0px)) 0
    calc(12px + env(safe-area-inset-left, 0px));
  pointer-events: none;
  font-family: system-ui, sans-serif;
  color: #e8e6d8;
  z-index: 10;
  user-select: none;
  -webkit-user-select: none;
}
.hud3d-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.hud3d-bar {
  position: relative;
  height: 10px;
  border: 1px solid rgba(232, 230, 216, 0.6);
  border-radius: 3px;
  background: #222a3f;
  overflow: hidden;
}
.hud3d-energy { flex: 0 1 46%; }
.hud3d-energy-fill {
  height: 100%;
  width: 100%;
  background: #ffd54a;
}
.hud3d-energy.is-low .hud3d-energy-fill { background: #8a5a3f; }
.hud3d-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(11, 16, 32, 0.8);
}
.hud3d-meter {
  width: 100%;
  max-width: 100%;
  overflow: visible;
  background: #b7a479;
}
.hud3d-meter-segment { position: absolute; top: 0; bottom: 0; left: 0; }
.hud3d-meter-safe { background: #3fae9c; }
.hud3d-meter-caught { background: #8a2f2f; }
.hud3d-marker {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: #f2ead0;
}
.hud3d-status { font-size: 12px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9); }
.hud3d-label-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.hud3d-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 130px rgba(4, 8, 18, 0.55);
}
.hud3d-label {
  position: absolute;
  transform: translate(-50%, -100%);
  font-size: 12px;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  animation: hud3d-label-fade 0.5s ease-out forwards;
}
.hud3d-label.is-hit { color: #8fd07a; }
.hud3d-label.is-miss { color: #9aa0a8; }
.hud3d-label.is-no-energy { color: #ff6b5e; }
@keyframes hud3d-label-fade {
  0% { opacity: 1; margin-top: 0; }
  60% { opacity: 1; }
  100% { opacity: 0; margin-top: -14px; }
}
`;

const LABEL_CLASS: Record<ScareFeedbackKind, string> = {
  hit: "is-hit",
  miss: "is-miss",
  "no-energy": "is-no-energy",
};

interface CachedValue<T> {
  value: T;
  set(next: T): void;
}

/** Cache wrapper: only calls the setter (a DOM write) when the value changes. */
function cached<T>(initial: T, set: (next: T) => void): CachedValue<T> {
  return { value: initial, set(next: T) {
    if (next !== this.value) {
      this.value = next;
      set(next);
    }
  } };
}

export class HudOverlay {
  private readonly root: HTMLDivElement;
  private readonly energyBar: HTMLDivElement;
  private readonly energyFill: HTMLDivElement;
  private readonly meterSafe: HTMLDivElement;
  private readonly meterCaught: HTMLDivElement;
  private readonly statusText: HTMLSpanElement;
  private readonly labelLayer: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly labelTimeouts = new Set<ReturnType<typeof setTimeout>>();

  private readonly cachedEnergyFill = cached("100.00%", (w) => {
    this.energyFill.style.width = w;
  });
  private readonly cachedEnergyLow = cached(false, (low) => {
    this.energyBar.classList.toggle("is-low", low);
  });
  private readonly cachedSafeWidth = cached("0.00%", (w) => {
    this.meterSafe.style.width = w;
  });
  private readonly cachedCaughtWidth = cached("0.00%", (w) => {
    this.meterCaught.style.width = w;
  });
  private readonly cachedStatus = cached("", (text) => {
    this.statusText.textContent = text;
  });

  constructor(container: HTMLElement) {
    injectStylesOnce();

    this.root = document.createElement("div");
    this.root.className = "hud3d";

    // Energy row: label + segmented bar.
    const energyRow = document.createElement("div");
    energyRow.className = "hud3d-row";
    const energyLabel = document.createElement("span");
    energyLabel.textContent = "Energía";
    this.energyBar = document.createElement("div");
    this.energyBar.className = "hud3d-bar hud3d-energy";
    this.energyFill = document.createElement("div");
    this.energyFill.className = "hud3d-energy-fill";
    this.energyBar.appendChild(this.energyFill);
    energyRow.appendChild(energyLabel);
    energyRow.appendChild(this.energyBar);

    // Ecosystem meter: stacked safe/caught over a sand-colored pending base,
    // with 50% / 70% healthy-band markers.
    const meter = document.createElement("div");
    meter.className = "hud3d-bar hud3d-meter";
    this.meterSafe = document.createElement("div");
    this.meterSafe.className = "hud3d-meter-segment hud3d-meter-safe";
    this.meterCaught = document.createElement("div");
    this.meterCaught.className = "hud3d-meter-segment hud3d-meter-caught";
    const bandMin = document.createElement("div");
    bandMin.className = "hud3d-marker";
    bandMin.style.left = "50%";
    const bandMax = document.createElement("div");
    bandMax.className = "hud3d-marker";
    bandMax.style.left = "70%";
    meter.appendChild(this.meterSafe);
    meter.appendChild(this.meterCaught);
    meter.appendChild(bandMin);
    meter.appendChild(bandMax);

    this.statusText = document.createElement("span");
    this.statusText.className = "hud3d-status";
    this.statusText.setAttribute("role", "status");
    this.statusText.setAttribute("aria-live", "polite");

    // Floating scare-feedback labels + soft vignette (night mood).
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "hud3d-label-layer";
    this.vignette = document.createElement("div");
    this.vignette.className = "hud3d-vignette";

    this.root.appendChild(energyRow);
    this.root.appendChild(meter);
    this.root.appendChild(this.statusText);
    this.root.appendChild(this.labelLayer);
    this.root.appendChild(this.vignette);
    container.appendChild(this.root);
  }

  /** Energy band ticks, one per affordable scare (from the energy config). */
  setEnergySegments(max: number, scareCost: number): void {
    for (let k = 1; k * scareCost < max; k++) {
      const tick = document.createElement("div");
      tick.className = "hud3d-tick";
      tick.style.left = `${((k * scareCost) / max) * 100}%`;
      this.energyBar.appendChild(tick);
    }
  }

  /** Refresh the HUD from one frame's model values. */
  update(bar: EnergyBar, meter: EcosystemMeter, counts: HudCounts): void {
    this.cachedEnergyFill.set(`${(bar.fraction * 100).toFixed(2)}%`);
    this.cachedEnergyLow.set(!bar.canScare);
    this.cachedSafeWidth.set(`${(meter.safe * 100).toFixed(2)}%`);
    this.cachedCaughtWidth.set(`${(meter.caught * 100).toFixed(2)}%`);
    this.cachedStatus.set(`${counts.safe}/${counts.total} · ${statusLabel(meter.status)}`);
  }

  /** Show/hide the whole HUD strip (hidden behind menu/intro screens). */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "" : "none";
  }

  /** Brief floating label near a screen point (scare feedback). */
  showFloatingLabel(text: string, kind: ScareFeedbackKind, clientX: number, clientY: number): void {
    const label = document.createElement("div");
    label.className = `hud3d-label ${LABEL_CLASS[kind]}`;
    label.textContent = text;
    label.style.left = `${clientX}px`;
    label.style.top = `${clientY}px`;
    this.labelLayer.appendChild(label);
    const timeout = setTimeout(() => {
      label.remove();
      this.labelTimeouts.delete(timeout);
    }, 500);
    this.labelTimeouts.add(timeout);
  }


  /** Screen-point -> label coordinate space is the overlay root. */
  toLocalX(clientX: number, container: HTMLElement): number {
    return clientX - container.getBoundingClientRect().left;
  }

  toLocalY(clientY: number, container: HTMLElement): number {
    return clientY - container.getBoundingClientRect().top;
  }

  dispose(): void {
    for (const timeout of this.labelTimeouts) clearTimeout(timeout);
    this.labelTimeouts.clear();
    this.root.remove();
  }
}

function injectStylesOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
