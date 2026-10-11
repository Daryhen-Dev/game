import { describe, expect, it } from "vitest";
import { resultsModel, type SimOutcome } from "./results";

const BAND = { min: 0.5, max: 0.7 };

describe("resultsModel", () => {
  it("balanced: good tone, teaches the balance concept", () => {
    const model = resultsModel("balanced", 0.6, 1000, BAND, null);
    expect(model.title).toBe("¡Ecosistema en equilibrio!");
    expect(model.explanation).toBe(
      "Llegaron suficientes crías para sostener la población y los depredadores tuvieron alimento.",
    );
    expect(model.verdictTone).toBe("good");
    expect(model.ratePercent).toBe(60);
    expect(model.score).toBe(1000);
    expect(model.isNewBest).toBe(true);
  });

  it("turtle-collapse: bad tone, explains the turtle collapse", () => {
    const model = resultsModel("turtle-collapse", 0.2, 0, BAND, null);
    expect(model.title).toBe("Colapso de tortugas");
    expect(model.explanation).toBe(
      "Muy pocas crías llegaron al mar: la población de tortugas verdes no se recupera.",
    );
    expect(model.verdictTone).toBe("bad");
  });

  it("predators-starve: bad tone, explains over-protection", () => {
    const model = resultsModel("predators-starve", 0.95, 0, BAND, null);
    expect(model.title).toBe("Depredadores sin alimento");
    expect(model.explanation).toBe(
      "Protegiste demasiado: los depredadores se quedaron sin alimento y la cadena alimenticia se resiente.",
    );
    expect(model.verdictTone).toBe("bad");
  });

  it("rounds the survival percent to the nearest integer", () => {
    expect(resultsModel("balanced", 0.853, 900, BAND, null).ratePercent).toBe(85);
    expect(resultsModel("balanced", 0.647, 900, BAND, null).ratePercent).toBe(65);
  });

  it("labels the band from the config (en dash, no spaces)", () => {
    expect(resultsModel("balanced", 0.6, 1000, { min: 0.5, max: 0.7 }, null).bandLabel).toBe("50–70%");
    expect(resultsModel("balanced", 0.6, 1000, { min: 0.45, max: 0.8 }, null).bandLabel).toBe("45–80%");
  });

  describe("new best", () => {
    const outcomes: SimOutcome[] = ["balanced", "turtle-collapse", "predators-starve"];

    it("a higher balanced score beats the stored best", () => {
      expect(resultsModel("balanced", 0.6, 850, BAND, 700).isNewBest).toBe(true);
    });

    it("a tie is not a new best", () => {
      expect(resultsModel("balanced", 0.6, 700, BAND, 700).isNewBest).toBe(false);
    });

    it("a lower score is not a new best", () => {
      expect(resultsModel("balanced", 0.6, 500, BAND, 700).isNewBest).toBe(false);
    });

    it("only balanced runs can set a best: losing runs never do, even with no stored best", () => {
      for (const outcome of outcomes) {
        const model = resultsModel(outcome, 0.2, 0, BAND, null);
        expect(model.isNewBest, outcome).toBe(false);
      }
    });

    it("no stored best + positive balanced score is a new best", () => {
      expect(resultsModel("balanced", 0.6, 850, BAND, null).isNewBest).toBe(true);
    });
  });
});
