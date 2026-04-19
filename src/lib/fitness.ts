import { ActivityLevel, BiologicalSex, DailyLog, GoalType, WeightUnit } from "./types";

export const UNIT_OPTIONS: WeightUnit[] = ["lb", "kg"];
export const GOAL_OPTIONS: GoalType[] = [
  "bulk",
  "lean_bulk",
  "dirty_bulk",
  "maintenance",
  "cut",
  "super_cut",
];
export const SEX_OPTIONS: BiologicalSex[] = ["male", "female"];

export const EXERCISE_LEVEL_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
  { value: "sedentary", label: "Sedentary" },
  { value: "lightly_active", label: "Lightly active" },
  { value: "moderately_active", label: "Moderately active" },
  { value: "very_active", label: "Very active" },
  { value: "extra_active", label: "Extra active" },
];

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value * 0.45359237;
}

function calculateBmr(weightKg: number, heightCm: number, age: number, sex: BiologicalSex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function calculateMaintenanceCalories(input: {
  weightKg: number;
  age: number;
  sex: BiologicalSex;
  heightCm: number;
  activityLevel: ActivityLevel;
}): number {
  const bmr = calculateBmr(input.weightKg, input.heightCm, input.age, input.sex);
  return Math.round(bmr * ACTIVITY_MULTIPLIER[input.activityLevel]);
}

export function buildAutoActivitySuggestion(logs: DailyLog[]): ActivityLevel {
  const latest = logs
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const totalMinutes = latest.reduce(
    (sum, log) => sum + log.exercises.reduce((entrySum, ex) => entrySum + (ex.durationMin || 0), 0),
    0,
  );
  const totalBurned = latest.reduce((sum, log) => sum + (log.totalExerciseCalories || 0), 0);

  if (totalMinutes < 60 && totalBurned < 800) return "sedentary";
  if (totalMinutes < 160 && totalBurned < 1800) return "lightly_active";
  if (totalMinutes < 280 && totalBurned < 2800) return "moderately_active";
  if (totalMinutes < 420 && totalBurned < 4200) return "very_active";
  return "extra_active";
}
