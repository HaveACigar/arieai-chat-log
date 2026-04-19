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
  sex: BiologicalSex;
  age: number;
  defaultWeightUnit: WeightUnit;
}
