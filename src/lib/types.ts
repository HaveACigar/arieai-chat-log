export type WeightUnit = "lb" | "kg";

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

export interface ExerciseEntry {
  name: string;
  durationMin: number;
  caloriesBurned: number;
  intensity: "low" | "moderate" | "high";
}

export interface DailyLog {
  date: string;
  weight: number;
  weightUnit: WeightUnit;
  caloriesIn: number;
  caloriesMaintenance: number;
  goalType: GoalType;
  activityLevel: ActivityLevel;
  sex: BiologicalSex;
  age: number;
  heightCm: number;
  notes?: string;
  exercises: ExerciseEntry[];
  totalExerciseCalories: number;
  photoUrls: string[];
  updatedAt: string;
}

export interface Profile {
  sex: BiologicalSex;
  age: number;
  defaultWeightUnit: WeightUnit;
}
