import { describe, expect, it } from "vitest";
import { next, type ScreenAction, type ScreenState } from "./flow";

describe("screen flow state machine", () => {
  it("menu + play goes to intro when the intro was not seen yet", () => {
    expect(next("menu", { type: "play", introSeen: false })).toBe("intro");
  });

  it("menu + play goes straight to playing when the intro was already seen", () => {
    expect(next("menu", { type: "play", introSeen: true })).toBe("playing");
  });

  it("menu + show-intro opens the intro", () => {
    expect(next("menu", { type: "show-intro" })).toBe("intro");
  });

  it("intro + start begins play", () => {
    expect(next("intro", { type: "start" })).toBe("playing");
  });

  it("intro + to-menu returns to the menu (Esc)", () => {
    expect(next("intro", { type: "to-menu" })).toBe("menu");
  });

  it("playing + level-ended shows the results", () => {
    expect(next("playing", { type: "level-ended" })).toBe("results");
  });

  it("results + retry restarts play", () => {
    expect(next("results", { type: "retry" })).toBe("playing");
  });

  it("results + to-menu returns to the menu", () => {
    expect(next("results", { type: "to-menu" })).toBe("menu");
  });

  it("invalid actions return the same state", () => {
    const invalid: Array<[ScreenState, ScreenAction]> = [
      // "play" only works from the menu.
      ["intro", { type: "play", introSeen: false }],
      ["playing", { type: "play", introSeen: true }],
      ["results", { type: "play", introSeen: false }],
      // "show-intro" only works from the menu.
      ["intro", { type: "show-intro" }],
      ["playing", { type: "show-intro" }],
      ["results", { type: "show-intro" }],
      // "start" only works from the intro.
      ["menu", { type: "start" }],
      ["playing", { type: "start" }],
      ["results", { type: "start" }],
      // "retry" only works from the results.
      ["menu", { type: "retry" }],
      ["intro", { type: "retry" }],
      ["playing", { type: "retry" }],
      // "to-menu" only works from the intro or the results.
      ["menu", { type: "to-menu" }],
      ["playing", { type: "to-menu" }],
      // "level-ended" only fires while playing.
      ["menu", { type: "level-ended" }],
      ["intro", { type: "level-ended" }],
      ["results", { type: "level-ended" }],
    ];
    for (const [state, action] of invalid) {
      expect(next(state, action), `${state} + ${action.type}`).toBe(state);
    }
  });
});
