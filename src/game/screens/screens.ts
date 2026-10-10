/**
 * DOM screens (menu / intro / results) rendered as HTML overlays above the
 * Three.js canvas.
 *
 * Thin glue on purpose (not unit tested): the content model comes from the
 * pure modules (flow.ts, results.ts). Each visible screen captures pointer
 * events so taps never reach the canvas underneath, uses real <button>s with
 * big touch targets, moves focus to the primary button when it opens, and
 * supports Esc -> menu on intro/results. Transitions are disabled under
 * `prefers-reduced-motion`.
 */
import type { ResultsModel, BandLike } from "./results";
import type { ScreenState } from "./flow";

export interface ScreensCallbacks {
  /** "Jugar" from the menu. */
  onPlay(): void;
  /** "Cómo se juega" from the menu. */
  onShowIntro(): void;
  /** "Empezar" from the intro. */
  onStart(): void;
  /** "Reintentar" from the results. */
  onRetry(): void;
  /** "Menú" button or Esc on intro/results. */
  onMenu(): void;
}

const STYLE_ID = "screens-styles";

const CSS = `
.screens-root, .screens-root * {
  box-sizing: border-box;
  min-width: 0;
}
.screens-root {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  font-family: system-ui, sans-serif;
  color: #f2ead0;
}
.screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px calc(16px + env(safe-area-inset-right, 0px)) 24px calc(16px + env(safe-area-inset-left, 0px));
  padding-top: calc(24px + env(safe-area-inset-top, 0px));
  background: rgba(4, 8, 18, 0.45);
  pointer-events: auto;
  animation: screen-fade 0.25s ease-out;
}
.screen-panel {
  width: 100%;
  max-width: 340px;
  max-height: 100%;
  overflow-y: auto;
  padding: 22px 20px;
  border-radius: 18px;
  background: rgba(11, 16, 32, 0.92);
  border: 1px solid rgba(63, 174, 156, 0.55);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  text-align: center;
}
.screen-title {
  margin: 0 0 4px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.screen-subtitle {
  margin: 0 0 16px;
  font-size: 14px;
  color: #b8d8cf;
}
.screen-best {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: #ffd54a;
}
.screen-btn {
  display: block;
  width: 100%;
  min-height: 48px;
  margin: 0 0 10px;
  padding: 12px 16px;
  border-radius: 14px;
  border: 2px solid transparent;
  font-family: inherit;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
}
.screen-btn:last-child { margin-bottom: 0; }
.screen-btn-primary {
  background: #3fae9c;
  border-color: #7fd8c9;
  color: #06231d;
}
.screen-btn-primary:focus-visible,
.screen-btn-secondary:focus-visible {
  outline: 3px solid #ffd54a;
  outline-offset: 2px;
}
.screen-btn-secondary {
  background: rgba(242, 234, 208, 0.08);
  border-color: rgba(242, 234, 208, 0.6);
  color: #f2ead0;
}
.intro-card {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(242, 234, 208, 0.07);
  text-align: left;
}
.intro-card h2 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
  color: #7fd8c9;
}
.intro-card p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.45;
}
.results-explanation {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.5;
}
.results-band-track {
  position: relative;
  height: 14px;
  margin: 0 0 6px;
  border-radius: 7px;
  border: 1px solid rgba(242, 234, 208, 0.6);
  background: #222a3f;
  overflow: hidden;
}
.results-band-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: #ffd54a;
}
.results-band-band {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(63, 174, 156, 0.45);
  border-left: 2px solid #f2ead0;
  border-right: 2px solid #f2ead0;
}
.results-band-caption {
  margin: 0 0 14px;
  font-size: 13px;
  color: #b8d8cf;
}
.results-score {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}
.results-newbest {
  display: inline-block;
  margin: 0 0 14px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #ffd54a;
  color: #4a3405;
  font-size: 13px;
  font-weight: 800;
  animation: newbest-pop 0.4s ease-out;
}
.is-good .screen-title { color: #8fd07a; }
.is-bad .screen-title { color: #ff8a7a; }
@keyframes screen-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes newbest-pop {
  0% { transform: scale(0.7); }
  70% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .screen { animation: none; }
  .results-newbest { animation: none; }
}
`;

/**
 * Title icons per intro card. The renderer scene already shows the creatures;
 * these icons are just quick visual anchors for the text.
 */
const INTRO_CARDS = [
  {
    icon: "\u{1F422}",
    title: "Las crías",
    body: "Tortugas verdes de Galápagos recién nacidas: cruzan la playa de noche, guiadas por la luna, para llegar al mar.",
  },
  {
    icon: "\u{1F980}",
    title: "Los depredadores",
    body: "Cangrejo fantasma, fragata magnífica y garza de lava cazan en la playa. Tócalos para asustarlos: cada susto gasta energía.",
  },
  {
    icon: "\u2696\uFE0F",
    title: "El equilibrio",
    body: "Logra que llegue entre el 50% y el 70% de las crías: ni muy pocas (colapso) ni todas (los depredadores se quedan sin alimento).",
  },
] as const;

export class Screens {
  private readonly root: HTMLDivElement;
  /** Screen currently shown (drives Esc handling). */
  private current: ScreenState | null = null;
  /** Container siblings made inert while a dialog is open (canvas + HUD). */
  private inertTargets: Element[] = [];
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.current === "intro" || this.current === "results") this.callbacks.onMenu();
  };

  /**
   * Focus trap: with a modal dialog open, Tab and Shift+Tab cycle inside it
   * (the dialog declares aria-modal="true", so background UI must not be
   * reachable). Focus wraps across the dialog's buttons.
   */
  private readonly onTrapKey = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const focusables = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    const inside = active !== null && this.root.contains(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  constructor(
    container: HTMLElement,
    private readonly callbacks: ScreensCallbacks,
  ) {
    injectStylesOnce();
    this.root = document.createElement("div");
    this.root.className = "screens-root";
    container.appendChild(this.root);
    document.addEventListener("keydown", this.onKeyDown);
  }

  /** Menu: title, subtitle, best score (if any) and the two entry buttons. */
  showMenu(best: number | null): void {
    const panel = this.openScreen("menu", "screen-title", "Hatchling Run");
    const subtitle = document.createElement("p");
    subtitle.className = "screen-subtitle";
    subtitle.textContent = "Bahía Las Bachas · Galápagos";
    panel.appendChild(subtitle);

    if (best !== null) {
      const bestLine = document.createElement("p");
      bestLine.className = "screen-best";
      bestLine.textContent = `Récord: ${best} puntos`;
      panel.appendChild(bestLine);
    }

    panel.appendChild(this.button("Jugar", "screen-btn-primary", this.callbacks.onPlay));
    panel.appendChild(this.button("Cómo se juega", "screen-btn-secondary", this.callbacks.onShowIntro));
  }

  /** Intro / "Cómo se juega": three short cards plus "Empezar". */
  showIntro(): void {
    const panel = this.openScreen("intro", "screen-title", "Cómo se juega");
    for (const card of INTRO_CARDS) {
      const el = document.createElement("section");
      el.className = "intro-card";
      const heading = document.createElement("h2");
      heading.textContent = `${card.icon} ${card.title}`;
      const body = document.createElement("p");
      body.textContent = card.body;
      el.appendChild(heading);
      el.appendChild(body);
      panel.appendChild(el);
    }
    panel.appendChild(this.button("Empezar", "screen-btn-primary", this.callbacks.onStart));
  }

  /** Results: outcome copy, survival vs band bar, score, new-best badge. */
  showResults(model: ResultsModel, band: BandLike): void {
    const panel = this.openScreen("results", "screen-title", model.title);
    panel.classList.add(model.verdictTone === "good" ? "is-good" : "is-bad");

    const explanation = document.createElement("p");
    explanation.className = "results-explanation";
    explanation.textContent = model.explanation;
    panel.appendChild(explanation);

    const track = document.createElement("div");
    track.className = "results-band-track";
    const bandHighlight = document.createElement("div");
    bandHighlight.className = "results-band-band";
    bandHighlight.style.left = `${band.min * 100}%`;
    bandHighlight.style.width = `${(band.max - band.min) * 100}%`;
    const fill = document.createElement("div");
    fill.className = "results-band-fill";
    fill.style.width = `${model.ratePercent}%`;
    track.appendChild(bandHighlight);
    track.appendChild(fill);
    panel.appendChild(track);

    const caption = document.createElement("p");
    caption.className = "results-band-caption";
    caption.textContent = `Supervivencia: ${model.ratePercent}% · banda saludable ${model.bandLabel}`;
    panel.appendChild(caption);

    const score = document.createElement("p");
    score.className = "results-score";
    score.textContent = `Puntos: ${model.score}`;
    panel.appendChild(score);

    if (model.isNewBest) {
      const badge = document.createElement("p");
      badge.className = "results-newbest";
      badge.textContent = "¡Nuevo récord!";
      panel.appendChild(badge);
    }

    panel.appendChild(this.button("Reintentar", "screen-btn-primary", this.callbacks.onRetry));
    panel.appendChild(this.button("Menú", "screen-btn-secondary", this.callbacks.onMenu));
  }

  /** Remove the current screen (game canvas takes over). */
  hide(): void {
    this.current = null;
    this.releaseInert();
    this.root.replaceChildren();
  }

  dispose(): void {
    this.releaseInert();
    document.removeEventListener("keydown", this.onKeyDown);
    this.root.remove();
  }

  // --- internals ---

  /**
   * Make the game canvas container and HUD uninteractive/unreachable while
   * the modal dialog is open (inert, with aria-hidden as the fallback), and
   * install the focus-trap key handler.
   */
  private applyInert(): void {
    const parent = this.root.parentElement;
    if (parent) {
      this.inertTargets = Array.from(parent.children).filter((el) => el !== this.root);
      for (const el of this.inertTargets) {
        if (el instanceof HTMLElement) el.inert = true;
        else el.setAttribute("aria-hidden", "true");
      }
    }
    document.addEventListener("keydown", this.onTrapKey);
  }

  private releaseInert(): void {
    for (const el of this.inertTargets) {
      if (el instanceof HTMLElement) el.inert = false;
      else el.removeAttribute("aria-hidden");
    }
    this.inertTargets = [];
    document.removeEventListener("keydown", this.onTrapKey);
  }

  /** Clear the root, open a dialog shell, and return its panel. */
  private openScreen(state: ScreenState, titleId: string, titleText: string): HTMLDivElement {
    this.current = state;
    this.releaseInert();
    this.root.replaceChildren();
    this.applyInert();

    const screen = document.createElement("div");
    screen.className = "screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.setAttribute("aria-labelledby", titleId);

    const panel = document.createElement("div");
    panel.className = "screen-panel";
    const title = document.createElement("h1");
    title.id = titleId;
    title.className = "screen-title";
    title.textContent = titleText;
    panel.appendChild(title);
    screen.appendChild(panel);
    this.root.appendChild(screen);
    return panel;
  }

  /** Real <button> (native Enter/Space activation, 48px touch target). */
  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `screen-btn ${className}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    if (className === "screen-btn-primary") {
      // Focus moves to the primary button when the screen opens.
      queueMicrotask(() => {
        if (button.isConnected) button.focus({ preventScroll: true });
      });
    }
    return button;
  }
}

function injectStylesOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
