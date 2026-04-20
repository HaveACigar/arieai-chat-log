import { ActivityLevel, BiologicalSex, DailyLog, DietRestriction, GoalType, MealEntry, NutritionLog, SleepLog, SleepQuality, WeightUnit, WorkoutCategory, WorkoutLog } from "./types";

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

export const WORKOUT_CATEGORY_OPTIONS: WorkoutCategory[] = [
  "arms",
  "legs",
  "core",
  "cardio",
  "chest",
  "back",
  "shoulders",
  "full_body",
];

export const WORKOUT_PRESETS_BY_CATEGORY: Record<WorkoutCategory, string[]> = {
  arms: ["Barbell curl", "Hammer curl", "Tricep pushdown", "Skull crusher"],
  legs: ["Squat", "Leg press", "Romanian deadlift", "Lunge"],
  core: ["Leg lift", "Cable crunch", "Plank", "Hanging knee raise"],
  cardio: ["Run", "Bike", "Row", "Stair climber"],
  chest: ["Bench press", "Incline dumbbell press", "Chest fly", "Push-up"],
  back: ["Barbell row", "Lat pulldown", "Seated row", "Deadlift"],
  shoulders: ["Overhead press", "Lateral raise", "Rear delt fly", "Upright row"],
  full_body: ["Deadlift", "Clean and press", "Thruster", "Burpee"],
};

export const SLEEP_QUALITY_OPTIONS: SleepQuality[] = ["poor", "fair", "good", "excellent"];

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

export function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = Math.max(0, feet) * 12 + Math.max(0, inches);
  return Number((totalInches * 2.54).toFixed(1));
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  if (!Number.isFinite(cm) || cm <= 0) return { feet: 0, inches: 0 };
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    return { feet: feet + 1, inches: 0 };
  }
  return { feet, inches };
}

export function formatGoalLabel(goal: GoalType): string {
  return goal.replaceAll("_", " ");
}

export function formatWorkoutCategoryLabel(category: WorkoutCategory): string {
  return category.replaceAll("_", " ");
}

export function sleepQualityScore(quality: SleepQuality): number {
  if (quality === "poor") return 1;
  if (quality === "fair") return 2;
  if (quality === "good") return 3;
  return 4;
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

export const DIET_RESTRICTION_OPTIONS: DietRestriction[] = [
  "none",
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "keto",
  "paleo",
  "halal",
  "kosher",
  "nut_free",
  "low_fodmap",
];

export const ESSENTIAL_VITAMINS_BY_AGE: Array<{
  group: string;
  vitamins: string[];
}> = [
  { group: "Children (4-12)", vitamins: ["Vitamin A", "Vitamin C", "Vitamin D", "Vitamin E", "Vitamin K", "B Vitamins"] },
  { group: "Teens (13-18)", vitamins: ["Vitamin D", "Vitamin B12", "Folate", "Vitamin C", "Vitamin A"] },
  { group: "Adults (19-50)", vitamins: ["Vitamin D", "Vitamin C", "Vitamin A", "Vitamin E", "Vitamin K", "B12", "Folate"] },
  { group: "Older Adults (51+)", vitamins: ["Vitamin D", "Vitamin B12", "Vitamin B6", "Folate", "Vitamin C"] },
  { group: "Pregnancy", vitamins: ["Folate", "Vitamin D", "Vitamin B12", "Choline", "Vitamin C"] },
];

const BASE_VITAMIN_FOODS: Record<string, string[]> = {
  "Vitamin A": ["Sweet potatoes", "Carrots", "Spinach"],
  "Vitamin C": ["Bell peppers", "Citrus fruits", "Strawberries"],
  "Vitamin D": ["Salmon", "Egg yolks", "Fortified milk"],
  "Vitamin E": ["Almonds", "Sunflower seeds", "Avocado"],
  "Vitamin K": ["Kale", "Broccoli", "Spinach"],
  "B Vitamins": ["Beans", "Whole grains", "Eggs"],
  "B12": ["Fish", "Dairy", "Fortified nutritional yeast"],
  "Folate": ["Lentils", "Leafy greens", "Asparagus"],
  "Vitamin B6": ["Chickpeas", "Banana", "Potatoes"],
  "Choline": ["Eggs", "Chicken", "Soybeans"],
};

export function formatDietRestrictionLabel(value: DietRestriction): string {
  return value.replaceAll("_", " ");
}

export function vitaminFoodSuggestions(vitamin: string, restrictions: DietRestriction[]): string[] {
  let foods = BASE_VITAMIN_FOODS[vitamin] || ["Balanced mixed whole-food meal"];

  if (restrictions.includes("vegan")) {
    foods = foods.filter((f) => !["Egg yolks", "Dairy", "Salmon", "Chicken", "Fish", "Fortified milk", "Eggs"].includes(f));
    if (vitamin === "B12" || vitamin === "Vitamin D") {
      foods = [...foods, "Fortified plant milk", "Fortified cereal"];
    }
  }
  if (restrictions.includes("vegetarian")) {
    foods = foods.filter((f) => !["Salmon", "Chicken", "Fish"].includes(f));
  }
  if (restrictions.includes("dairy_free")) {
    foods = foods.filter((f) => !["Dairy", "Fortified milk"].includes(f));
  }
  if (restrictions.includes("nut_free")) {
    foods = foods.filter((f) => !["Almonds"].includes(f));
  }
  if (restrictions.includes("gluten_free")) {
    foods = foods.filter((f) => !["Whole grains"].includes(f));
  }
  return Array.from(new Set(foods)).slice(0, 4);
}

export function macroCalories(macros: { proteinG: number; carbsG: number; fatG: number }): number {
  return macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9;
}

export function mealIdeasFromHistory(input: {
  logs: NutritionLog[];
  restrictions: DietRestriction[];
}): string[] {
  const recentMeals: MealEntry[] = input.logs
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)
    .flatMap((log) => log.meals || []);

  const topMeals = recentMeals
    .reduce<Record<string, number>>((acc, meal) => {
      const key = meal.description.trim().toLowerCase();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  const habitual = Object.entries(topMeals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);

  const ideas: string[] = [];
  if (habitual.length) {
    ideas.push(`You often eat ${habitual[0]}. Try a higher-protein version of it this week.`);
  }

  if (input.restrictions.includes("vegan")) {
    ideas.push("Meal idea: tofu stir-fry with quinoa and mixed vegetables.");
    ideas.push("Meal idea: lentil pasta with tomato-spinach sauce and hemp seeds.");
  } else if (input.restrictions.includes("vegetarian")) {
    ideas.push("Meal idea: Greek yogurt bowl, berries, oats, and chia.");
    ideas.push("Meal idea: paneer and chickpea grain bowl with greens.");
  } else if (input.restrictions.includes("keto")) {
    ideas.push("Meal idea: salmon, avocado salad, olive oil dressing.");
    ideas.push("Meal idea: eggs with spinach, mushrooms, and feta.");
  } else {
    ideas.push("Meal idea: grilled chicken, brown rice, and roasted vegetables.");
    ideas.push("Meal idea: turkey chili with beans and side salad.");
  }

  if (input.restrictions.includes("gluten_free")) {
    ideas.push("Gluten-free idea: rice bowl with lean protein, veggies, and tahini sauce.");
  }
  if (input.restrictions.includes("dairy_free")) {
    ideas.push("Dairy-free idea: coconut yogurt parfait with berries and pumpkin seeds.");
  }

  return Array.from(new Set(ideas)).slice(0, 5);
}

function daysBetweenIso(start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function linearRegressionProjection(points: Array<{ x: number; y: number }>, xTarget: number): number | null {
  if (points.length < 2) return null;

  const count = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);

  const denominator = count * sumXX - sumX * sumX;
  if (!denominator) return null;

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  return intercept + slope * xTarget;
}

function aggregateCaloriesByDate(dailyLogs: DailyLog[], nutritionLogs: NutritionLog[]): Array<{ date: string; calories: number }> {
  const byDate = new Map<string, number>();

  dailyLogs.forEach((log) => {
    if (log.caloriesIn > 0) byDate.set(log.date, log.caloriesIn);
  });

  nutritionLogs.forEach((log) => {
    if (log.caloriesKcal > 0) byDate.set(log.date, log.caloriesKcal);
  });

  return Array.from(byDate.entries())
    .map(([date, calories]) => ({ date, calories }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthlyPrediction {
  isUnlocked: boolean;
  daysObserved: number;
  distinctLogDays: number;
  unlockThresholdDays: number;
  unlockThresholdEntries: number;
  reason: string;
  projectedWeightKg: number | null;
  projectedBmi: number | null;
  projectedCalories: number | null;
  projectedSleepHours: number | null;
  projectedWeeklyWorkoutVolume: number | null;
  summary: string[];
}

export function buildMonthlyPrediction(input: {
  dailyLogs: DailyLog[];
  nutritionLogs: NutritionLog[];
  sleepLogs: SleepLog[];
  workoutLogs: WorkoutLog[];
}): MonthlyPrediction {
  const allDates = Array.from(new Set([
    ...input.dailyLogs.map((log) => log.date),
    ...input.nutritionLogs.map((log) => log.date),
    ...input.sleepLogs.map((log) => log.date),
    ...input.workoutLogs.map((log) => log.date),
  ])).sort();

  const distinctLogDays = allDates.length;
  const daysObserved = allDates.length >= 2 ? daysBetweenIso(allDates[0], allDates[allDates.length - 1]) + 1 : distinctLogDays;
  const unlockThresholdDays = 28;
  const unlockThresholdEntries = 20;
  const isUnlocked = daysObserved >= unlockThresholdDays && distinctLogDays >= unlockThresholdEntries;

  if (!isUnlocked) {
    return {
      isUnlocked,
      daysObserved,
      distinctLogDays,
      unlockThresholdDays,
      unlockThresholdEntries,
      reason: `Prediction unlocks after about 4 weeks of history. You currently have ${distinctLogDays} logged days across ${daysObserved} observed days.`,
      projectedWeightKg: null,
      projectedBmi: null,
      projectedCalories: null,
      projectedSleepHours: null,
      projectedWeeklyWorkoutVolume: null,
      summary: [],
    };
  }

  const summary: string[] = [];
  const earliestDate = allDates[0];
  const lastObservedDay = daysBetweenIso(earliestDate, allDates[allDates.length - 1]);
  const targetDay = lastObservedDay + 30;

  const weightPoints = input.dailyLogs
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => ({ x: daysBetweenIso(earliestDate, log.date), y: toKg(log.weight, log.weightUnit) }));

  const projectedWeightKgRaw = weightPoints.length >= 6 ? linearRegressionProjection(weightPoints, targetDay) : null;
  const projectedWeightKg = projectedWeightKgRaw ? Number(Math.max(30, projectedWeightKgRaw).toFixed(1)) : null;
  const latestHeightCm = input.dailyLogs.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.heightCm || 188;
  const projectedBmi = projectedWeightKg ? calculateBmi(projectedWeightKg, latestHeightCm) : null;

  const caloriePoints = aggregateCaloriesByDate(input.dailyLogs, input.nutritionLogs)
    .map((row) => ({ x: daysBetweenIso(earliestDate, row.date), y: row.calories }));
  const projectedCaloriesRaw = caloriePoints.length >= 6 ? linearRegressionProjection(caloriePoints, targetDay) : null;
  const projectedCalories = projectedCaloriesRaw ? Math.round(Math.max(0, projectedCaloriesRaw)) : null;

  const sleepPoints = input.sleepLogs
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => ({ x: daysBetweenIso(earliestDate, log.date), y: log.hours }));
  const projectedSleepHoursRaw = sleepPoints.length >= 6 ? linearRegressionProjection(sleepPoints, targetDay) : null;
  const projectedSleepHours = projectedSleepHoursRaw ? Number(Math.max(0, projectedSleepHoursRaw).toFixed(1)) : null;

  const workoutVolumeByDate = input.workoutLogs.reduce<Map<string, number>>((acc, log) => {
    acc.set(log.date, (acc.get(log.date) || 0) + (log.totalVolume || 0));
    return acc;
  }, new Map<string, number>());
  const workoutPoints = Array.from(workoutVolumeByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totalVolume]) => ({ x: daysBetweenIso(earliestDate, date), y: totalVolume }));
  const projectedWorkoutVolumeRaw = workoutPoints.length >= 6 ? linearRegressionProjection(workoutPoints, targetDay) : null;
  const projectedWeeklyWorkoutVolume = projectedWorkoutVolumeRaw ? Math.round(Math.max(0, projectedWorkoutVolumeRaw) * 7) : null;

  if (projectedWeightKg !== null) {
    summary.push(`At the current trend, bodyweight projects to about ${projectedWeightKg} kg in 30 days.`);
  }
  if (projectedBmi !== null) {
    summary.push(`Projected BMI in 30 days is about ${projectedBmi}.`);
  }
  if (projectedCalories !== null) {
    summary.push(`Average intake trend points toward roughly ${projectedCalories} kcal per day next month.`);
  }
  if (projectedSleepHours !== null) {
    summary.push(`Sleep trend points toward about ${projectedSleepHours} hours per night next month.`);
  }
  if (projectedWeeklyWorkoutVolume !== null) {
    summary.push(`Training trend points toward roughly ${projectedWeeklyWorkoutVolume.toLocaleString()} total weekly volume.`);
  }

  if (summary.length === 0) {
    summary.push("You have enough history to unlock predictions, but not enough repeated entries in one category yet for a strong monthly projection.");
  }

  return {
    isUnlocked,
    daysObserved,
    distinctLogDays,
    unlockThresholdDays,
    unlockThresholdEntries,
    reason: "Prediction is based on simple trend analysis from your logged data and is not medical advice.",
    projectedWeightKg,
    projectedBmi,
    projectedCalories,
    projectedSleepHours,
    projectedWeeklyWorkoutVolume,
    summary,
  };
}
