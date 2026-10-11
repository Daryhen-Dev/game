/**
 * Pure screen-flow state machine for the game shell.
 *
 * States: menu -> intro -> playing -> results, with results -> playing
 * (Reintentar) and results/intro -> menu. No DOM, no side effects: `next`
 * returns the new state, and invalid actions return the same state unchanged.
 */

export type ScreenState = "menu" | "intro" | "playing" | "results";

export type ScreenAction =
  /** "Jugar" from the menu; jumps straight to playing when the intro was seen. */
  | { type: "play"; introSeen: boolean }
  /** "Cómo se juega" from the menu. */
  | { type: "show-intro" }
  /** "Empezar" from the intro (also the intro skip path). */
  | { type: "start" }
  /** "Reintentar" from the results. */
  | { type: "retry" }
  /** "Menú" button or Esc from the intro/results. */
  | { type: "to-menu" }
  /** The level ended (win or lose) while playing. */
  | { type: "level-ended" };

/** Pure transition: returns the new state; invalid actions keep the state. */
export function next(state: ScreenState, action: ScreenAction): ScreenState {
  switch (action.type) {
    case "play":
      if (state !== "menu") return state;
      return action.introSeen ? "playing" : "intro";
    case "show-intro":
      return state === "menu" ? "intro" : state;
    case "start":
      return state === "intro" ? "playing" : state;
    case "retry":
      return state === "results" ? "playing" : state;
    case "to-menu":
      return state === "intro" || state === "results" ? "menu" : state;
    case "level-ended":
      return state === "playing" ? "results" : state;
  }
}
