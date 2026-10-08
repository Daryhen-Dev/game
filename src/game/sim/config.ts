/** Survival-rate band considered healthy for the ecosystem, as fractions in (0, 1). */
export interface HealthyBand {
  /** Minimum healthy survival rate (exclusive lower bound of the range 0..1). */
  min: number;
  /** Maximum healthy survival rate (exclusive upper bound of the range 0..1). */
  max: number;
}

export interface LevelConfig {
  id: string;
  name: string;
  hatchlings: number;
  healthyBand: HealthyBand;
}

export const LEVEL_1: LevelConfig = {
  id: "las-bachas",
  name: "Bahía Las Bachas",
  hatchlings: 40,
  healthyBand: { min: 0.5, max: 0.7 },
};
