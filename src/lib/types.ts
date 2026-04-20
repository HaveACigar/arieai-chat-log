export type WeightUnit = "lb" | "kg";
export type HeightUnit = "ft_in" | "cm";

export type GoalType =
  | "bulk"
  | "lean_bulk"
  | "dirty_bulk"
  | "maintenance"
  | "cut"
  | "super_cut";

export type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extra_active";

export type BiologicalSex = "male" | "female";

export interface DailyPhoto {
  url: string;
  description?: string;
}

export interface ExerciseEntry {
  name: string;
  durationMin: number;
  caloriesBurned: number;
  intensity: "low" | "moderate" | "high";
}

export interface WorkoutEntry {
  exercise: string;
  sets: number;
  reps: number;
  weight: number;
  notes?: string;
}

export type WorkoutCategory =
  | "arms"
  | "legs"
  | "core"
  | "cardio"
  | "chest"
  | "back"
  | "shoulders"
  | "full_body";

export interface WorkoutLog {
  date: string;
  category: WorkoutCategory;
  entries: WorkoutEntry[];
  totalVolume: number;
  updatedAt: string;
}

export type SleepQuality = "poor" | "fair" | "good" | "excellent";

export interface SleepLog {
  date: string;
  hours: number;
  quality: SleepQuality;
  notes?: string;
  updatedAt: string;
}

export interface DailyLog {
  date: string;
  weight: number;
  weightUnit: WeightUnit;
  boneMass?: number;
  weighInContext?: string;
  caloriesIn: number;
  caloriesMaintenance: number;
  goalType: GoalType;
  activityLevel: ActivityLevel;
  sex: BiologicalSex;
  age: number;
  heightCm: number;
  notes?: string;
  exercises: ExerciseEntry[];
  workouts?: WorkoutEntry[];
  totalExerciseCalories: number;
  photoUrls: string[];
  photoEntries?: DailyPhoto[];
  updatedAt: string;
}

export interface Profile {
  displayName?: string;
  sex: BiologicalSex;
  age: number;
  defaultWeightUnit: WeightUnit;
  heightUnit?: HeightUnit;
  heightCm?: number;
  heightFt?: number;
  heightIn?: number;
  profilePhotoUrl?: string;
  updatedAt?: string;
}

// ─── Nutrition ────────────────────────────────────────────────────────────────

export type DietRestriction =
  | "none"
  | "vegetarian"
  | "vegan"
  | "gluten_free"
  | "dairy_free"
  | "keto"
  | "paleo"
  | "halal"
  | "kosher"
  | "nut_free"
  | "low_fodmap";

export interface MacroEntry {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealEntry {
  mealName: string;        // "Breakfast" | "Lunch" | custom
  description: string;
  caloriesKcal: number;
  estimatedCaloriesKcal?: number;
  macros: MacroEntry;
  ingredients?: string[];
  photoUrl?: string;
  time?: string;           // "08:30"
}

export interface NutritionLog {
  date: string;
  caloriesKcal: number;
  macros: MacroEntry;
  meals: MealEntry[];
  dietRestrictions: DietRestriction[];
  notes?: string;
  updatedAt: string;
}
