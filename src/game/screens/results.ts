/**
 * Pure results-screen model: outcome copy, rate vs healthy band, score and
 * new-best logic. No DOM — the screen paints whatever this returns.
 *
 * Best-score policy (decided): only BALANCED runs can set a new best. Losing
 * runs always score 0 (the sim scores 0 outside the healthy band), so they
 * could never beat a stored best anyway; gating on `balanced` also prevents
 * a meaningless 0 from becoming the first "best".
 */

export type SimOutcome = "balanced" | "turtle-collapse" | "predators-starve";

export interface ResultsModel {
  title: string;
  explanation: string;
  /** Survival percent rounded to the nearest integer (rate * 100). */
  ratePercent: number;
  /** Healthy band as Spanish copy, e.g. "50–70%". */
  bandLabel: string;
  score: number;
  isNewBest: boolean;
  verdictTone: "good" | "bad";
}

const TITLES: Record<SimOutcome, string> = {
  balanced: "¡Ecosistema en equilibrio!",
  "turtle-collapse": "Colapso de tortugas",
  "predators-starve": "Depredadores sin alimento",
};

/** Copy teaches the food-chain balance concept behind each outcome. */
const EXPLANATIONS: Record<SimOutcome, string> = {
  balanced: "Llegaron suficientes crías para sostener la población y los depredadores tuvieron alimento.",
  "turtle-collapse": "Muy pocas crías llegaron al mar: la población de tortugas verdes no se recupera.",
  "predators-starve":
    "Protegiste demasiado: los depredadores se quedaron sin alimento y la cadena alimenticia se resiente.",
};

export interface BandLike {
  min: number;
  max: number;
}

export function resultsModel(
  outcome: SimOutcome,
  rate: number,
  score: number,
  band: BandLike,
  best: number | null,
): ResultsModel {
  const ratePercent = Math.round(rate * 100);
  const bandLabel = `${Math.round(band.min * 100)}–${Math.round(band.max * 100)}%`;
  // Only balanced runs count for the best (see module doc); ties never beat.
  const isNewBest = outcome === "balanced" && (best === null ? score > 0 : score > best);
  return {
    title: TITLES[outcome],
    explanation: EXPLANATIONS[outcome],
    ratePercent,
    bandLabel,
    score,
    isNewBest,
    verdictTone: outcome === "balanced" ? "good" : "bad",
  };
}

/** A finished run as reported by the renderer/sim. */
export interface RunResultLike {
  outcome: SimOutcome;
  rate: number;
  score: number;
}

/** A settled run: the screen model plus the best-score bookkeeping. */
export interface SettledRun {
  model: ResultsModel;
  /** Best score after this run (the value the shell keeps in memory). */
  nextBest: number | null;
  /** True when `nextBest` must be persisted to storage. */
  persist: boolean;
}

/**
 * ONE source of truth for settling a finished run: the results model is
 * built against the PREVIOUS best (so the record-setting run itself shows
 * the "new best" badge), and the new best is persisted only when the model
 * says it is one. The shell must not update its stored best before calling
 * this — that ordering bug made the badge unreachable in real gameplay.
 */
export function settleRun(
  prevBest: number | null,
  result: RunResultLike,
  band: BandLike,
): SettledRun {
  const model = resultsModel(result.outcome, result.rate, result.score, band, prevBest);
  return {
    model,
    nextBest: model.isNewBest ? result.score : prevBest,
    persist: model.isNewBest,
  };
}
