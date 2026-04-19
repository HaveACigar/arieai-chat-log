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

export const PHOTO_DESCRIPTION_PRESETS = [
  "First photo of the day",
  "After workout",
  "After meal",
  "Morning check-in",
  "Evening check-in",
  "Weekly progress",
  "Flex photo",
];

export const WEIGH_IN_CONTEXT_OPTIONS = [
  "First weigh-in of the day",
  "After workout",
  "After meal",
  "Post-travel",
  "Before bed",
  "Normal check-in",
];

export const WORKOUT_PRESETS = [
  "Bench press",
  "Squat",
  "Deadlift",
  "Overhead press",
  "Barbell row",
  "Pull-up",
  "Leg press",
  "Leg lift",
  "Lat pulldown",
  "Dumbbell curl",
  "Tricep pushdown",
  "Hip thrust",
];

export const GOAL_GUIDANCE: Record<GoalType, string> = {
  bulk: "Eat above maintenance with steady training volume and weekly photo check-ins.",
  lean_bulk: "Aim for a small surplus, high protein, and slow weight gain to keep body fat under control.",
  dirty_bulk: "Useful only short-term; watch digestion, energy, and photo trends so you do not overshoot.",
  maintenance: "Keep calories near maintenance and use workouts, recovery, and consistency as your main levers.",
  cut: "Stay in a moderate deficit, protect protein intake, and monitor strength so the cut stays productive.",
  super_cut: "Use carefully and short-term only; energy, recovery, and hunger signals matter more here.",
};

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

export function formatGoalLabel(goal: GoalType): string {
  return goal.replaceAll("_", " ");
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  if (!meters) return 0;
  return Number((weightKg / (meters * meters)).toFixed(1));
}

export function calculateEstimatedOneRepMax(weight: number, reps: number): number {
  if (!weight || weight <= 0) return 0;
  if (!reps || reps <= 1) return Number(weight.toFixed(1));
  return Number((weight * (1 + reps / 30)).toFixed(1));
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

export function buildHealthSuggestions(input: {
  bmi: number | null;
  maintenance: number | null;
  caloriesIn: number | null;
  goalType: GoalType;
  boneMass: number | null;
  activityLevel: ActivityLevel;
  workoutCount: number;
  photoCount: number;
}): string[] {
  const suggestions: string[] = [];

  if (input.caloriesIn && input.maintenance) {
    const delta = input.caloriesIn - input.maintenance;
    if (input.goalType.includes("cut") && delta > -150) {
      suggestions.push("Your cut intake is close to maintenance. Tighten calories or increase activity if fat loss stalls.");
    }
    if (input.goalType.includes("bulk") && delta < 150) {
      suggestions.push("For a bulk, your intake is still close to maintenance. Add a small surplus if scale weight is flat.");
    }
  }

  if (input.bmi) {
    if (input.bmi < 18.5) suggestions.push("BMI is in the lighter range. Prioritize steady calories, recovery, and progressive overload.");
    if (input.bmi >= 25 && input.goalType.includes("bulk")) suggestions.push("Bulking while BMI is already elevated can hide progress. Lean bulk is usually the cleaner move.");
  }

  if (input.boneMass && input.boneMass < 5) {
    suggestions.push("Bone mass reads low. Treat it as a trend signal only and pair it with strength, nutrition, and medical guidance if needed.");
  }

  if (input.workoutCount === 0) {
    suggestions.push("No strength workout logged yet. Add one or two anchor lifts so you can track PRs over time.");
  }

  if (input.photoCount === 0) {
    suggestions.push("Add a progress photo occasionally. Photos often reveal changes the scale misses.");
  }

  if (input.activityLevel === "sedentary") {
    suggestions.push("Your selected activity level is sedentary. A short walk or light session can improve recovery and calorie balance.");
  }

  return suggestions.slice(0, 4);
}
