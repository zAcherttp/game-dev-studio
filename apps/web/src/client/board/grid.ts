import type { CameraValue } from "./model.js";

export const GRID_BASE = 16;

export const GRID_LEVELS = 3;

const FADE_FROM = 8;

const FADE_TO = 16;

const LEVEL_ALPHA = [0.22, 0.28, 0.36] as const;

export interface GridLevel {
  readonly spacing: number;
  readonly alpha: number;
  readonly x: number;
  readonly y: number;
}

const modulo = (value: number, size: number) => ((value % size) + size) % size;

export const gridLevels = (camera: CameraValue): readonly GridLevel[] =>
  Array.from({ length: GRID_LEVELS }, (_unused, level) => {
    const spacing = GRID_BASE * 4 ** level * camera.zoom;

    const fade = Math.min(
      1,
      Math.max(0, (spacing - FADE_FROM) / (FADE_TO - FADE_FROM))
    );

    return {
      alpha: fade * (LEVEL_ALPHA[level] ?? 0.3),
      spacing,
      x: modulo(camera.x, spacing),
      y: modulo(camera.y, spacing),
    };
  }).filter((level) => level.alpha > 0);

export const gridStyle = (camera: CameraValue) => {
  const levels = gridLevels(camera);

  return {
    backgroundImage: levels
      .map(
        ({ alpha }) =>
          `radial-gradient(circle, rgba(200, 200, 214, ${alpha.toFixed(3)}) 0.8px, transparent 1.2px)`
      )
      .join(", "),
    backgroundPosition: levels
      .map(
        ({ spacing, x, y }) =>
          `${(x - spacing / 2).toFixed(2)}px ${(y - spacing / 2).toFixed(2)}px`
      )
      .join(", "),
    backgroundSize: levels
      .map(({ spacing }) => `${spacing.toFixed(2)}px ${spacing.toFixed(2)}px`)
      .join(", "),
  };
};
