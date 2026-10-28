export const wellnessLevels = [0, 500, 1500, 3000, 5000, 10000];

export function wellnessLevel(total: unknown) {
  const xp = Math.max(0, Math.round(Number(total) || 0));
  const index = wellnessLevels.reduce((level, threshold, i) => xp >= threshold ? i : level, 0);
  const next = wellnessLevels[index + 1] ?? null;
  return {
    level: index + 1, xp, nextLevelXp: next ?? xp,
    remaining: next === null ? 0 : next - xp,
    progress: next === null ? 100 : 100 * (xp - wellnessLevels[index]) / (next - wellnessLevels[index]),
  };
}
