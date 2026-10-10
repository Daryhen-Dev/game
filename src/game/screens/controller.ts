/**
 * GameController: owns the screen-flow state, the DOM screens and the
 * LevelRenderer lifecycle for the whole game shell.
 *
 * Attract-mode decision (documented): on menu/intro/results the scene shows a
 * RUNNING simulation with scare input disabled. That reuses the exact
 * production render path (cheapest option that still looks alive: hatchlings
 * crawl, predators hunt, the ocean animates) — a paused renderer would show a
 * frozen frame instead. When the ambient run finishes, a fresh one respawns.
 *
 * Every "Jugar"/"Empezar"/"Reintentar" disposes the previous LevelRenderer
 * and creates a new one with a fresh seed, so GPU resources are freed each
 * restart (leak-checked via `resourceCounts()`; see the ?perf=1 probe).
 */
import { LEVEL_1, createRng } from "../sim";
import { LevelRenderer, type LevelEndedResult } from "../three/LevelRenderer";
import { next, type ScreenAction, type ScreenState } from "./flow";
import { resultsModel, settleRun, type ResultsModel, type SimOutcome } from "./results";
import { loadBest, saveBest } from "./bestScore";
import { readFlag, writeFlag, type StorageLike } from "./storage";
import { Screens } from "./screens";

/** localStorage flag marking the intro as already seen. */
export const INTRO_SEEN_KEY = "hatchling-run:intro-seen";

export interface FakeResults {
  outcome: SimOutcome;
  rate: number;
  score: number;
}

export interface GameParams {
  /** Initial screen; default menu (`?t=` implies playing). */
  screen: ScreenState;
  seed?: number;
  fastForwardSec?: number;
  /** Fake outcome for ?screen=results screenshots. */
  fakeResults?: FakeResults;
  /** ?perf=1: expose resource counters / restart probe for leak checks. */
  perf: boolean;
  /** ?restarts=N (with perf=1): auto-restart the renderer N times (debug). */
  restarts: number;
}

/** Parse the debug URL params; invalid or missing values are ignored. */
export function readGameParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const options: GameParams = { screen: "menu", perf: false, restarts: 0 };

  const rawSeed = params.get("seed");
  if (rawSeed !== null) {
    const seed = Number(rawSeed);
    if (Number.isFinite(seed)) options.seed = seed >>> 0;
  }
  const rawFastForward = params.get("t");
  if (rawFastForward !== null) {
    const seconds = Number(rawFastForward);
    if (Number.isFinite(seconds) && seconds > 0) {
      options.fastForwardSec = seconds;
      options.screen = "playing"; // ?t= keeps the gameplay screenshot recipe working.
    }
  }

  const rawScreen = params.get("screen");
  if (rawScreen === "menu" || rawScreen === "intro" || rawScreen === "playing" || rawScreen === "results") {
    options.screen = rawScreen;
  }
  if (options.screen === "results") {
    const outcome = params.get("outcome");
    // Number(null) === 0, so absent params must be detected before parsing
    // (otherwise the 0.6 / 850 defaults would be dead code).
    const rawRate = params.get("rate");
    const rawScore = params.get("score");
    const rate = rawRate !== null ? Number(rawRate) : NaN;
    const score = rawScore !== null ? Number(rawScore) : NaN;
    options.fakeResults = {
      outcome:
        outcome === "turtle-collapse" || outcome === "predators-starve" ? outcome : "balanced",
      rate: Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0.6,
      score: Number.isFinite(score) && score >= 0 ? Math.round(score) : 850,
    };
  }

  options.perf = params.get("perf") === "1";
  const rawRestarts = Number(params.get("restarts"));
  if (Number.isSafeInteger(rawRestarts) && rawRestarts > 0) options.restarts = Math.min(rawRestarts, 20);
  return options;
}

/** window.localStorage adapter; null when storage is blocked entirely. */
function browserStorage(): StorageLike | null {
  try {
    // Accessing localStorage itself can throw (security/privacy settings).
    return window.localStorage;
  } catch {
    return null;
  }
}

const FRESH_SEED = (): number => (Math.random() * 0x100000000) >>> 0;

const DEFAULT_FAKE_RESULTS: FakeResults = { outcome: "balanced", rate: 0.6, score: 850 };

export class GameController {
  private state: ScreenState;
  private renderer: LevelRenderer | null = null;
  private best: number | null;
  private introSeen: boolean;
  private readonly screens: Screens;
  private restartProbeCount = 0;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    params: GameParams,
  ) {
    const storage = browserStorage();
    this.best = storage ? loadBest(storage) : null;
    this.introSeen = storage ? readFlag(storage, INTRO_SEEN_KEY) : false;
    this.state = params.screen;
    this.screens = new Screens(container, {
      onPlay: () => this.handlePlay(),
      onShowIntro: () => this.handleShowIntro(),
      onStart: () => this.handleStart(),
      onRetry: () => this.handleRetry(),
      onMenu: () => this.handleMenu(),
    });

    this.enter(params);
    if (params.restarts > 0 && params.perf) this.startRestartProbe(params.restarts);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer?.dispose();
    this.renderer = null;
    this.screens.dispose();
  }

  // --- state entry points ---

  private enter(params: GameParams): void {
    switch (params.screen) {
      case "menu":
        this.enterMenu();
        break;
      case "intro":
        this.enterIntro();
        break;
      case "playing":
        this.startPlaying(params.seed, params.fastForwardSec);
        break;
      case "results": {
        this.startAttract();
        this.renderer?.setHudVisible(true);
        const fake = params.fakeResults ?? DEFAULT_FAKE_RESULTS;
        this.showResultsScreen(fake);
        break;
      }
    }
  }

  private enterMenu(): void {
    this.state = "menu";
    this.startAttract();
    this.renderer?.setHudVisible(false);
    this.screens.showMenu(this.best);
  }

  private enterIntro(): void {
    this.state = "intro";
    this.startAttract();
    this.renderer?.setHudVisible(false);
    this.screens.showIntro();
  }

  // --- screen actions ---

  private handlePlay(): void {
    const state = this.transition({ type: "play", introSeen: this.introSeen });
    if (state === "intro") this.enterIntro();
    else if (state === "playing") this.startPlaying();
  }

  private handleShowIntro(): void {
    if (this.transition({ type: "show-intro" }) === "intro") this.enterIntro();
  }

  private handleStart(): void {
    if (this.transition({ type: "start" }) !== "playing") return;
    this.introSeen = true; // The player reached the end of the intro.
    this.markIntroSeen();
    this.startPlaying();
  }

  private handleRetry(): void {
    if (this.transition({ type: "retry" }) === "playing") this.startPlaying();
  }

  private handleMenu(): void {
    if (this.transition({ type: "to-menu" }) === "menu") this.enterMenu();
  }

  private transition(action: ScreenAction): ScreenState {
    this.state = next(this.state, action);
    return this.state;
  }

  // --- renderer lifecycle ---

  /** Ambient scene behind menu/intro/results: running sim, input disabled. */
  private startAttract(): void {
    this.replaceRenderer({ inputEnabled: false, seed: FRESH_SEED() });
  }

  /** Real run: fresh renderer with a fresh seed and scare input enabled. */
  private startPlaying(seed?: number, fastForwardSec?: number): void {
    this.replaceRenderer({
      inputEnabled: true,
      seed: seed ?? FRESH_SEED(),
      fastForwardSec,
    });
    this.renderer?.setHudVisible(true);
    this.screens.hide();
  }

  private replaceRenderer(options: {
    inputEnabled: boolean;
    seed: number;
    fastForwardSec?: number;
  }): void {
    this.renderer?.dispose();
    this.renderer = new LevelRenderer(this.container, {
      config: LEVEL_1,
      seed: options.seed,
      rng: createRng(options.seed),
      fastForwardSec: options.fastForwardSec,
      inputEnabled: options.inputEnabled,
      onLevelEnded: (result) => this.handleLevelEnded(result),
    });
  }

  private handleLevelEnded(result: LevelEndedResult): void {
    if (this.disposed) return;
    if (this.state === "playing") {
      // Best-score decision in ONE place: settleRun builds the results model
      // against the PREVIOUS best (so the record run shows the badge), and
      // only then is the new best kept/persisted.
      const settled = settleRun(this.best, result, LEVEL_1.healthyBand);
      this.best = settled.nextBest;
      if (settled.persist && settled.nextBest !== null) {
        const storage = browserStorage();
        if (storage) saveBest(storage, settled.nextBest);
      }
      this.transition({ type: "level-ended" });
      this.showResultsModel(settled.model);
      this.renderer?.setHudVisible(true);
    } else {
      // Attract mode: the ambient run finished — respawn a fresh scene, but
      // DEFERRED out of the render callback stack so the old renderer is
      // never disposed while its own tick() is still running.
      queueMicrotask(() => {
        if (this.disposed) return;
        this.startAttract();
        this.renderer?.setHudVisible(false);
      });
    }
  }

  private showResultsScreen(result: FakeResults): void {
    // Debug fake results: build the model directly (no best-score settling).
    this.showResultsModel(
      resultsModel(result.outcome, result.rate, result.score, LEVEL_1.healthyBand, this.best),
    );
  }

  private showResultsModel(model: ResultsModel): void {
    this.screens.showResults(model, LEVEL_1.healthyBand);
  }

  private markIntroSeen(): void {
    const storage = browserStorage();
    if (storage) writeFlag(storage, INTRO_SEEN_KEY, true);
  }

  // --- ?perf=1&restarts=N debug probe ---

  /**
   * Leak check: restart the renderer through the exact same code path as
   * "Jugar" every 2 s, logging GPU resource counters to the console AND to a
   * visible debug list (headless screenshots can't read the console).
   */
  private startRestartProbe(restarts: number): void {
    const probeLines = document.createElement("div");
    probeLines.style.cssText =
      "position:absolute;left:8px;bottom:8px;z-index:30;pointer-events:none;" +
      "font:11px/1.5 monospace;color:#8fd07a;text-shadow:0 1px 2px #000;";
    this.container.appendChild(probeLines);
    const sample = (): void => {
      if (this.disposed) return;
      const counts = this.renderer?.resourceCounts();
      if (counts) {
        const line =
          `[restart ${this.restartProbeCount}] geometries=${counts.geometries} ` +
          `textures=${counts.textures} programs=${counts.programs} drawCalls=${counts.drawCalls} ` +
          `liveContexts=${counts.liveContexts}`;
        console.log(`[restart-probe] ${line}`);
        const row = document.createElement("div");
        row.textContent = line;
        probeLines.appendChild(row);
      }
      // Counters fill on the first rendered frame, so sample AFTER a pause;
      // then wait before the next restart to let it run a while.
      if (this.restartProbeCount < restarts) setTimeout(step, 1200);
    };
    const step = (): void => {
      if (this.disposed) return;
      this.restartProbeCount++;
      this.startPlaying();
      setTimeout(sample, 800);
    };
    setTimeout(step, 1500);
  }
}
