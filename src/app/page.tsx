"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./page.module.css";
import { auth, db, storage } from "@/lib/firebase";
import {
  EXERCISE_LEVEL_OPTIONS,
  GOAL_GUIDANCE,
  GOAL_OPTIONS,
  PHOTO_DESCRIPTION_PRESETS,
  SEX_OPTIONS,
  UNIT_OPTIONS,
  WEIGH_IN_CONTEXT_OPTIONS,
  WORKOUT_PRESETS,
  buildAutoActivitySuggestion,
  buildHealthSuggestions,
  calculateBmi,
  calculateEstimatedOneRepMax,
  calculateMaintenanceCalories,
  formatDate,
  formatGoalLabel,
  toKg,
} from "@/lib/fitness";
import {
  ActivityLevel,
  DailyLog,
  DailyPhoto,
  ExerciseEntry,
  GoalType,
  Profile,
  WeightUnit,
  WorkoutEntry,
} from "@/lib/types";

const FIXED_HEIGHT_CM = 188;
const MAX_PHOTO_SIZE_MB = 20;

interface StagedPhoto {
  id: string;
  file: File;
  previewUrl: string;
  description: string;
}

function makeEmptyExercise(): ExerciseEntry {
  return {
    name: "",
    durationMin: 30,
    caloriesBurned: 0,
    intensity: "moderate",
  };
}

function makeEmptyWorkout(): WorkoutEntry {
  return {
    exercise: "",
    sets: 3,
    reps: 8,
    weight: 0,
    notes: "",
  };
}

function makePhotoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhotoEntries(log: DailyLog): DailyPhoto[] {
  if (log.photoEntries?.length) return log.photoEntries;
  return (log.photoUrls || []).map((url) => ({ url, description: "" }));
}

export default function Home() {
  const firebaseReady = Boolean(auth && db && storage);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lb");
  const [weight, setWeight] = useState("");
  const [boneMass, setBoneMass] = useState("");
  const [weighInContext, setWeighInContext] = useState("");
  const [caloriesIn, setCaloriesIn] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("maintenance");
  const [manualActivityLevel, setManualActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [sex, setSex] = useState<Profile["sex"]>("male");
  const [age, setAge] = useState("30");
  const [notes, setNotes] = useState("");
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<DailyPhoto[]>([]);
  const [exercises, setExercises] = useState<ExerciseEntry[]>([makeEmptyExercise()]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([makeEmptyWorkout()]);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [allLogs, setAllLogs] = useState<DailyLog[]>([]);
  const [auditRows, setAuditRows] = useState<Array<{ id: string; action: string; logDate: string; timestamp?: string }>>([]);

  useEffect(() => {
    if (!auth || !db || !storage) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setError("");
      setSuccess("");
      if (!nextUser) {
        setAllLogs([]);
        setAuditRows([]);
        setAuthLoading(false);
        return;
      }
      await loadUserData(nextUser.uid, selectedDate);
      setAuthLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadSingleLog(user.uid, selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const chartData = useMemo(() => {
    return allLogs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => ({
        date: log.date.slice(5),
        weightKg: Number(toKg(log.weight, log.weightUnit).toFixed(2)),
        caloriesIn: log.caloriesIn,
        caloriesOut: log.totalExerciseCalories,
      }));
  }, [allLogs]);

  const autoActivitySuggestion = useMemo(() => buildAutoActivitySuggestion(allLogs), [allLogs]);

  const maintenance = useMemo(() => {
    const asNumber = Number(weight);
    const ageNum = Number(age);
    if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
    if (!Number.isFinite(ageNum) || ageNum <= 0) return null;
    return calculateMaintenanceCalories({
      weightKg: toKg(asNumber, weightUnit),
      age: ageNum,
      sex,
      heightCm: FIXED_HEIGHT_CM,
      activityLevel: manualActivityLevel,
    });
  }, [age, manualActivityLevel, sex, weight, weightUnit]);

  const bmi = useMemo(() => {
    const weightVal = Number(weight);
    if (!Number.isFinite(weightVal) || weightVal <= 0) return null;
    return calculateBmi(toKg(weightVal, weightUnit), FIXED_HEIGHT_CM);
  }, [weight, weightUnit]);

  const goalGuidance = GOAL_GUIDANCE[goalType];

  const allPhotoSlides = useMemo(() => {
    return allLogs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((log) =>
        normalizePhotoEntries(log).map((photo, index) => ({
          id: `${log.date}-${index}`,
          date: log.date,
          url: photo.url,
          description: photo.description || "No description",
          weight: log.weight,
          weightUnit: log.weightUnit,
          goalType: log.goalType,
        })),
      );
  }, [allLogs]);

  useEffect(() => {
    if (selectedSlideIndex < allPhotoSlides.length) return;
    setSelectedSlideIndex(allPhotoSlides.length ? allPhotoSlides.length - 1 : 0);
  }, [allPhotoSlides.length, selectedSlideIndex]);

  const workoutLeaderboard = useMemo(() => {
    const byExercise = new Map<string, { exercise: string; topWeight: number; estimatedOneRepMax: number }>();

    allLogs.forEach((log) => {
      (log.workouts || []).forEach((workout) => {
        const exercise = workout.exercise.trim();
        if (!exercise) return;
        const oneRepMax = calculateEstimatedOneRepMax(workout.weight, workout.reps);
        const current = byExercise.get(exercise);
        if (!current || oneRepMax > current.estimatedOneRepMax) {
          byExercise.set(exercise, {
            exercise,
            topWeight: workout.weight,
            estimatedOneRepMax: oneRepMax,
          });
        }
      });
    });

    return Array.from(byExercise.values())
      .sort((a, b) => b.estimatedOneRepMax - a.estimatedOneRepMax)
      .slice(0, 6);
  }, [allLogs]);

  const achievements = useMemo(() => {
    const workoutCount = allLogs.reduce((sum, log) => sum + (log.workouts?.filter((entry) => entry.exercise.trim()).length || 0), 0);
    const photoCount = allLogs.reduce((sum, log) => sum + normalizePhotoEntries(log).length, 0);
    const distinctDates = new Set(allLogs.map((log) => log.date)).size;
    const results: string[] = [];

    if (distinctDates >= 1) results.push("First log recorded");
    if (distinctDates >= 7) results.push("7 logged days unlocked");
    if (photoCount >= 5) results.push("Progress photographer: 5+ photos stored");
    if (workoutCount >= 10) results.push("Strength streak: 10 workouts logged");
    if (workoutLeaderboard.length >= 3) results.push("PR board started across 3 lifts");

    const sorted = allLogs.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length >= 2) {
      const startKg = toKg(sorted[0].weight, sorted[0].weightUnit);
      const currentKg = toKg(sorted[sorted.length - 1].weight, sorted[sorted.length - 1].weightUnit);
      if (Math.abs(currentKg - startKg) >= 2.25) {
        results.push("Bodyweight trend moved 5 lb or more from your starting point");
      }
    }

    return results;
  }, [allLogs, workoutLeaderboard]);

  const personalLeaderboards = useMemo(() => {
    const sorted = allLogs.slice().sort((a, b) => a.date.localeCompare(b.date));
    const rows: Array<{ label: string; value: string }> = [];

    if (sorted.length >= 2) {
      const startKg = toKg(sorted[0].weight, sorted[0].weightUnit);
      const latestKg = toKg(sorted[sorted.length - 1].weight, sorted[sorted.length - 1].weightUnit);
      rows.push({
        label: "Net bodyweight change",
        value: `${(latestKg - startKg).toFixed(1)} kg`,
      });
    }

    const topBurn = sorted
      .slice()
      .sort((a, b) => (b.totalExerciseCalories || 0) - (a.totalExerciseCalories || 0))[0];
    if (topBurn) {
      rows.push({
        label: "Biggest exercise-burn day",
        value: `${topBurn.totalExerciseCalories} kcal on ${topBurn.date}`,
      });
    }

    const topPhotoDay = sorted
      .slice()
      .sort((a, b) => normalizePhotoEntries(b).length - normalizePhotoEntries(a).length)[0];
    if (topPhotoDay && normalizePhotoEntries(topPhotoDay).length) {
      rows.push({
        label: "Most documented day",
        value: `${normalizePhotoEntries(topPhotoDay).length} photos on ${topPhotoDay.date}`,
      });
    }

    if (workoutLeaderboard[0]) {
      rows.push({
        label: "Top estimated PR",
        value: `${workoutLeaderboard[0].exercise}: ${workoutLeaderboard[0].estimatedOneRepMax} ${weightUnit}`,
      });
    }

    return rows;
  }, [allLogs, workoutLeaderboard, weightUnit]);

  const healthSuggestions = useMemo(() => {
    return buildHealthSuggestions({
      bmi,
      maintenance,
      caloriesIn: Number.isFinite(Number(caloriesIn)) ? Number(caloriesIn) : null,
      goalType,
      boneMass: Number.isFinite(Number(boneMass)) ? Number(boneMass) : null,
      activityLevel: manualActivityLevel,
      workoutCount: workouts.filter((entry) => entry.exercise.trim()).length,
      photoCount: existingPhotos.length + stagedPhotos.length,
    });
  }, [bmi, boneMass, caloriesIn, existingPhotos.length, goalType, maintenance, manualActivityLevel, stagedPhotos.length, workouts]);

  async function loadUserData(uid: string, date: string) {
    if (!db) return;
    setLoadingData(true);
    try {
      const logsRef = collection(db, "users", uid, "dailyLogs");
      const logsSnap = await getDocs(logsRef);
      const rows: DailyLog[] = [];
      logsSnap.forEach((row) => {
        rows.push(row.data() as DailyLog);
      });
      rows.sort((a, b) => b.date.localeCompare(a.date));
      setAllLogs(rows);

      const auditRef = collection(db, "users", uid, "auditTrail");
      const auditSnap = await getDocs(query(auditRef, orderBy("timestamp", "desc")));
      const audit = auditSnap.docs.slice(0, 50).map((d) => {
        const payload = d.data() as { action?: string; logDate?: string; timestamp?: { toDate?: () => Date } };
        return {
          id: d.id,
          action: payload.action || "unknown",
          logDate: payload.logDate || "n/a",
          timestamp: payload.timestamp?.toDate ? payload.timestamp.toDate().toLocaleString() : undefined,
        };
      });
      setAuditRows(audit);

      await loadSingleLog(uid, date);
    } catch (err) {
      setError(`Unable to load your data. ${(err as Error)?.message || "Unknown error"}`);
    } finally {
      setLoadingData(false);
    }
  }

  async function loadSingleLog(uid: string, date: string) {
    if (!db) return;
    try {
      const refDoc = doc(db, "users", uid, "dailyLogs", date);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) {
        setStagedPhotos([]);
        setExistingPhotos([]);
        setExercises([makeEmptyExercise()]);
        setWorkouts([makeEmptyWorkout()]);
        setNotes("");
        setWeight("");
        setBoneMass("");
        setWeighInContext("");
        setCaloriesIn("");
        return;
      }
      const row = snap.data() as DailyLog;
      setWeight(String(row.weight));
      setWeightUnit(row.weightUnit);
      setBoneMass(row.boneMass ? String(row.boneMass) : "");
      setWeighInContext(row.weighInContext || "");
      setCaloriesIn(String(row.caloriesIn));
      setGoalType(row.goalType);
      setManualActivityLevel(row.activityLevel);
      setSex(row.sex);
      setAge(String(row.age));
      setNotes(row.notes || "");
      setExistingPhotos(normalizePhotoEntries(row));
      setExercises(row.exercises?.length ? row.exercises : [makeEmptyExercise()]);
      setWorkouts(row.workouts?.length ? row.workouts : [makeEmptyWorkout()]);
      setStagedPhotos([]);
    } catch (err) {
      setError(`Unable to load log for ${date}. ${(err as Error)?.message || "Unknown error"}`);
    }
  }

  async function handleEmailAuth(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setError("");
    setSuccess("");
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError((err as Error)?.message || "Unable to sign in.");
    }
  }

  async function handleGoogleLogin() {
    if (!auth) return;
    setError("");
    setSuccess("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError((err as Error)?.message || "Google sign-in failed.");
    }
  }

  async function uploadSelectedPhotos(uid: string): Promise<DailyPhoto[]> {
    if (!storage || !stagedPhotos.length) return [];
    const uploaded: DailyPhoto[] = [];
    for (const photo of stagedPhotos) {
      if (photo.file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
        throw new Error(`${photo.file.name} exceeds ${MAX_PHOTO_SIZE_MB}MB.`);
      }
      const key = `${Date.now()}-${photo.file.name.replace(/\s+/g, "-")}`;
      const storageRef = ref(storage, `users/${uid}/photos/${selectedDate}/${key}`);
      await uploadBytes(storageRef, photo.file);
      uploaded.push({
        url: await getDownloadURL(storageRef),
        description: photo.description || undefined,
      });
    }
    return uploaded;
  }

  async function handleSaveLog() {
    if (!user || !db || !storage) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const weightVal = Number(weight);
      const caloriesInVal = Number(caloriesIn);
      const ageVal = Number(age);
      const boneMassVal = boneMass ? Number(boneMass) : null;
      if (!Number.isFinite(weightVal) || weightVal <= 0) {
        throw new Error("Weight must be a positive number.");
      }
      if (!Number.isFinite(caloriesInVal) || caloriesInVal < 0) {
        throw new Error("Calories eaten must be zero or higher.");
      }
      if (!Number.isFinite(ageVal) || ageVal <= 0) {
        throw new Error("Age must be a positive number.");
      }
      if (boneMass && (!Number.isFinite(Number(boneMassVal)) || Number(boneMassVal) <= 0)) {
        throw new Error("Bone mass must be a positive number when provided.");
      }

      const cleanExercises = exercises
        .filter((entry) => entry.name.trim())
        .map((entry) => ({
          name: entry.name.trim(),
          durationMin: Number(entry.durationMin) || 0,
          caloriesBurned: Number(entry.caloriesBurned) || 0,
          intensity: entry.intensity,
        }));

      const cleanWorkouts = workouts
        .filter((entry) => entry.exercise.trim())
        .map((entry) => ({
          exercise: entry.exercise.trim(),
          sets: Number(entry.sets) || 0,
          reps: Number(entry.reps) || 0,
          weight: Number(entry.weight) || 0,
          notes: entry.notes?.trim() || "",
        }));

      const totalExerciseCalories = cleanExercises.reduce((sum, entry) => sum + entry.caloriesBurned, 0);

      const docRef = doc(db, "users", user.uid, "dailyLogs", selectedDate);
      const existing = await getDoc(docRef);
      const uploadedPhotos = await uploadSelectedPhotos(user.uid);
      const mergedPhotos = [...existingPhotos, ...uploadedPhotos];

      const nextLog: DailyLog = {
        date: selectedDate,
        weight: weightVal,
        weightUnit,
        boneMass: boneMassVal || undefined,
        weighInContext: weighInContext || undefined,
        caloriesIn: caloriesInVal,
        caloriesMaintenance: maintenance || 0,
        goalType,
        activityLevel: manualActivityLevel,
        sex,
        age: ageVal,
        heightCm: FIXED_HEIGHT_CM,
        notes,
        exercises: cleanExercises,
        workouts: cleanWorkouts,
        totalExerciseCalories,
        photoUrls: mergedPhotos.map((photo) => photo.url),
        photoEntries: mergedPhotos,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(docRef, nextLog, { merge: true });
      await setDoc(
        doc(db, "users", user.uid, "profile", "main"),
        {
          sex,
          age: ageVal,
          defaultWeightUnit: weightUnit,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await addDoc(collection(db, "users", user.uid, "auditTrail"), {
        action: existing.exists() ? "update" : "create",
        logDate: selectedDate,
        timestamp: serverTimestamp(),
        before: existing.exists() ? existing.data() : null,
        after: nextLog,
      });

      setExistingPhotos(mergedPhotos);
      setStagedPhotos([]);
      setSuccess(`Saved ${selectedDate} log successfully.`);
      await loadUserData(user.uid, selectedDate);
    } catch (err) {
      setError((err as Error)?.message || "Unable to save log.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLog() {
    if (!user || !db) return;
    const confirmed = window.confirm(`Delete log for ${selectedDate}? This action is audited and cannot be undone.`);
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const refDoc = doc(db, "users", user.uid, "dailyLogs", selectedDate);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) {
        throw new Error("No log exists for selected date.");
      }
      await deleteDoc(refDoc);
      await addDoc(collection(db, "users", user.uid, "auditTrail"), {
        action: "delete",
        logDate: selectedDate,
        timestamp: serverTimestamp(),
        before: snap.data(),
      });
      setSuccess(`Deleted log for ${selectedDate}.`);
      await loadUserData(user.uid, selectedDate);
      setWeight("");
      setBoneMass("");
      setWeighInContext("");
      setCaloriesIn("");
      setExercises([makeEmptyExercise()]);
      setWorkouts([makeEmptyWorkout()]);
      setExistingPhotos([]);
      setStagedPhotos([]);
      setNotes("");
    } catch (err) {
      setError((err as Error)?.message || "Unable to delete log.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <main className={styles.loading}>Loading app...</main>;
  }

  const currentSlide = allPhotoSlides[selectedSlideIndex];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1>ArieAI Fitness Log</h1>
        <p>
          Multi-user daily logging with photos, calorie tracking, exercise analytics, maintenance estimates, personal PR tracking, and a full edit/delete audit trail.
        </p>
      </section>

      {!user ? (
        <section className={styles.authCard}>
          <h2>Sign in to your account</h2>
          {!firebaseReady && (
            <p className={styles.error}>Add Firebase env vars in .env.local before signing in.</p>
          )}
          <button className={styles.googleBtn} onClick={handleGoogleLogin} disabled={!firebaseReady}>
            Continue with Google
          </button>
          <form onSubmit={handleEmailAuth} className={styles.formGrid}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
            <button type="submit" className={styles.primaryBtn} disabled={!firebaseReady}>
              {authMode === "signup" ? "Create account" : "Login with email"}
            </button>
          </form>
          <button
            className={styles.linkBtn}
            onClick={() => setAuthMode((current) => (current === "login" ? "signup" : "login"))}
          >
            {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </section>
      ) : (
        <>
          <section className={styles.topBar}>
            <div>
              <strong>{user.displayName || user.email}</strong>
              <p>{user.email}</p>
            </div>
            <button className={styles.linkBtn} onClick={() => { if (auth) void signOut(auth); }}>
              Sign out
            </button>
          </section>

          <section className={styles.tutorialCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Quick tutorial</h3>
                <p className={styles.muted}>Use this flow to keep logs clean and progression easy to review.</p>
              </div>
            </div>
            <div className={styles.tutorialGrid}>
              <div className={styles.tutorialStep}>
                <strong>1. Morning check-in</strong>
                <span>Log date, weight, optional weigh-in context, bone mass, and your current diet mode.</span>
              </div>
              <div className={styles.tutorialStep}>
                <strong>2. Daily activity</strong>
                <span>Add calorie-burning exercise plus strength workouts with sets, reps, and load so PRs can accumulate.</span>
              </div>
              <div className={styles.tutorialStep}>
                <strong>3. Photo proof</strong>
                <span>Add progress photos with optional preset descriptions like after workout or first photo of the day.</span>
              </div>
              <div className={styles.tutorialStep}>
                <strong>4. Review trends</strong>
                <span>Use the dashboard, photo slideshow, personal leaderboards, and achievements to see what is improving.</span>
              </div>
            </div>
          </section>

          <section className={styles.grid}>
            <article className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Daily log</h3>
                  <p className={styles.muted}>Track the daily inputs that drive body composition, strength, and recovery.</p>
                </div>
              </div>

              <div className={styles.formGrid}>
                <label>
                  Date
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </label>
                <label>
                  Weight
                  <div className={styles.inline}>
                    <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 201.4" />
                    <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}>
                      {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </div>
                </label>
                <label>
                  Weigh-in context (optional)
                  <select value={weighInContext} onChange={(e) => setWeighInContext(e.target.value)}>
                    <option value="">Choose a context</option>
                    {WEIGH_IN_CONTEXT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Bone mass (optional)
                  <input type="number" step="0.1" value={boneMass} onChange={(e) => setBoneMass(e.target.value)} placeholder="e.g. 8.7" />
                </label>
                <label>
                  Calories eaten
                  <input type="number" value={caloriesIn} onChange={(e) => setCaloriesIn(e.target.value)} />
                </label>
                <label>
                  Diet type
                  <select value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)}>
                    {GOAL_OPTIONS.map((goal) => <option key={goal} value={goal}>{formatGoalLabel(goal)}</option>)}
                  </select>
                  <span className={styles.fieldHint}>{goalGuidance}</span>
                </label>
                <label>
                  Sex
                  <select value={sex} onChange={(e) => setSex(e.target.value as Profile["sex"])}>
                    {SEX_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Age
                  <input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
                </label>
                <label>
                  Activity level
                  <select value={manualActivityLevel} onChange={(e) => setManualActivityLevel(e.target.value as ActivityLevel)}>
                    {EXERCISE_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Suggested activity level
                  <input value={autoActivitySuggestion} disabled />
                </label>
              </div>

              <h4>Exercise calories</h4>
              <div className={styles.exerciseList}>
                {exercises.map((exercise, index) => (
                  <div className={styles.exerciseRow} key={index}>
                    <input
                      placeholder="Exercise"
                      value={exercise.name}
                      onChange={(e) => setExercises((rows) => rows.map((row, idx) => idx === index ? { ...row, name: e.target.value } : row))}
                    />
                    <input
                      type="number"
                      placeholder="Min"
                      value={exercise.durationMin}
                      onChange={(e) => setExercises((rows) => rows.map((row, idx) => idx === index ? { ...row, durationMin: Number(e.target.value) } : row))}
                    />
                    <input
                      type="number"
                      placeholder="Burned"
                      value={exercise.caloriesBurned}
                      onChange={(e) => setExercises((rows) => rows.map((row, idx) => idx === index ? { ...row, caloriesBurned: Number(e.target.value) } : row))}
                    />
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setExercises((rows) => rows.length === 1 ? rows : rows.filter((_, idx) => idx !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className={styles.secondaryBtn} onClick={() => setExercises((rows) => [...rows, makeEmptyExercise()])}>
                Add exercise
              </button>

              <h4>Strength workouts</h4>
              <div className={styles.workoutList}>
                {workouts.map((workout, index) => (
                  <div className={styles.workoutRow} key={index}>
                    <input
                      list="workout-presets"
                      placeholder="Exercise / PR lift"
                      value={workout.exercise}
                      onChange={(e) => setWorkouts((rows) => rows.map((row, idx) => idx === index ? { ...row, exercise: e.target.value } : row))}
                    />
                    <input
                      type="number"
                      placeholder="Sets"
                      value={workout.sets}
                      onChange={(e) => setWorkouts((rows) => rows.map((row, idx) => idx === index ? { ...row, sets: Number(e.target.value) } : row))}
                    />
                    <input
                      type="number"
                      placeholder="Reps"
                      value={workout.reps}
                      onChange={(e) => setWorkouts((rows) => rows.map((row, idx) => idx === index ? { ...row, reps: Number(e.target.value) } : row))}
                    />
                    <input
                      type="number"
                      placeholder={`Weight (${weightUnit})`}
                      value={workout.weight}
                      onChange={(e) => setWorkouts((rows) => rows.map((row, idx) => idx === index ? { ...row, weight: Number(e.target.value) } : row))}
                    />
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setWorkouts((rows) => rows.length === 1 ? rows : rows.filter((_, idx) => idx !== index))}
                    >
                      Remove
                    </button>
                    <input
                      className={styles.workoutNotes}
                      placeholder="Optional notes"
                      value={workout.notes || ""}
                      onChange={(e) => setWorkouts((rows) => rows.map((row, idx) => idx === index ? { ...row, notes: e.target.value } : row))}
                    />
                  </div>
                ))}
              </div>
              <datalist id="workout-presets">
                {WORKOUT_PRESETS.map((preset) => <option key={preset} value={preset} />)}
              </datalist>
              <button type="button" className={styles.secondaryBtn} onClick={() => setWorkouts((rows) => [...rows, makeEmptyWorkout()])}>
                Add workout
              </button>

              <h4>Photos (optional)</h4>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  setStagedPhotos((current) => [
                    ...current,
                    ...files.map((file) => ({
                      id: makePhotoId(),
                      file,
                      previewUrl: URL.createObjectURL(file),
                      description: "",
                    })),
                  ]);
                  e.currentTarget.value = "";
                }}
              />
              <button type="button" className={styles.secondaryBtn} onClick={() => fileInputRef.current?.click()}>
                Add Photo
              </button>
              {(stagedPhotos.length > 0 || existingPhotos.length > 0) && (
                <div className={styles.photoGrid}>
                  {stagedPhotos.map((photo) => (
                    <div key={photo.id} className={styles.photoItem}>
                      <img src={photo.previewUrl} alt="preview" />
                      <button
                        type="button"
                        className={styles.removePhotoBtn}
                        onClick={() => setStagedPhotos((current) => current.filter((entry) => entry.id !== photo.id))}
                      >
                        x
                      </button>
                      <div className={styles.photoMeta}>
                        <span className={styles.photoLabel}>New</span>
                        <select
                          value={photo.description}
                          onChange={(e) => setStagedPhotos((current) => current.map((entry) => entry.id === photo.id ? { ...entry, description: e.target.value } : entry))}
                        >
                          <option value="">No description</option>
                          {PHOTO_DESCRIPTION_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {existingPhotos.map((photo, index) => (
                    <div key={`${photo.url}-${index}`} className={styles.photoItem}>
                      <img src={photo.url} alt="log" />
                      <button
                        type="button"
                        className={styles.removePhotoBtn}
                        onClick={() => setExistingPhotos((current) => current.filter((_, idx) => idx !== index))}
                      >
                        x
                      </button>
                      <div className={styles.photoMeta}>
                        <span className={styles.photoLabel}>Saved</span>
                        <select
                          value={photo.description || ""}
                          onChange={(e) => setExistingPhotos((current) => current.map((entry, idx) => idx === index ? { ...entry, description: e.target.value } : entry))}
                        >
                          <option value="">No description</option>
                          {PHOTO_DESCRIPTION_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label>
                Notes
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </label>

              <div className={styles.metrics}>
                <span>Height: 6&apos;2&quot; ({FIXED_HEIGHT_CM} cm)</span>
                <span>BMI: {bmi ? bmi : "enter weight"}</span>
                <span>Bone mass: {boneMass || "optional"}</span>
                <span>Maintenance estimate: {maintenance ? `${maintenance} kcal` : "enter age + weight"}</span>
              </div>

              <div className={styles.insightCard}>
                <h4>General health suggestions</h4>
                {healthSuggestions.length === 0 ? (
                  <p className={styles.muted}>Once you add more detail, this section will generate targeted pointers.</p>
                ) : (
                  <ul className={styles.listBlock}>
                    {healthSuggestions.map((tip) => <li key={tip}>{tip}</li>)}
                  </ul>
                )}
              </div>

              <div className={styles.ctaRow}>
                <button className={styles.primaryBtn} disabled={busy || loadingData} onClick={handleSaveLog}>
                  Save log
                </button>
                <button className={styles.dangerBtn} disabled={busy || loadingData} onClick={handleDeleteLog}>
                  Delete log
                </button>
              </div>
              {success && <p className={styles.success}>{success}</p>}
              {error && <p className={styles.error}>{error}</p>}
            </article>

            <article className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Progress dashboard</h3>
                  <p className={styles.muted}>Your chart, photo progression, personal leaderboards, and achievements all update off saved logs.</p>
                </div>
              </div>

              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Line yAxisId="left" type="monotone" dataKey="weightKg" stroke="#0f766e" strokeWidth={2} name="Weight (kg)" />
                    <Line yAxisId="right" type="monotone" dataKey="caloriesIn" stroke="#1f2937" strokeWidth={2} name="Calories In" />
                    <Line yAxisId="right" type="monotone" dataKey="caloriesOut" stroke="#b45309" strokeWidth={2} name="Calories Out" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.insightCard}>
                <h4>Photo progression slideshow</h4>
                {!currentSlide ? (
                  <p className={styles.muted}>Save at least one photo to unlock the progression slider.</p>
                ) : (
                  <div className={styles.slideshow}>
                    <img src={currentSlide.url} alt={currentSlide.description} className={styles.slideImage} />
                    <div className={styles.slideMeta}>
                      <strong>{currentSlide.date}</strong>
                      <span>{currentSlide.description}</span>
                      <span>{currentSlide.weight} {currentSlide.weightUnit} | {formatGoalLabel(currentSlide.goalType)}</span>
                    </div>
                    <div className={styles.slideControls}>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => setSelectedSlideIndex((current) => Math.max(current - 1, 0))}
                        disabled={selectedSlideIndex === 0}
                      >
                        Previous
                      </button>
                      <span>{selectedSlideIndex + 1} / {allPhotoSlides.length}</span>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => setSelectedSlideIndex((current) => Math.min(current + 1, allPhotoSlides.length - 1))}
                        disabled={selectedSlideIndex >= allPhotoSlides.length - 1}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.insightCard}>
                <h4>Leaderboards</h4>
                {personalLeaderboards.length === 0 ? (
                  <p className={styles.muted}>Save more data to populate your personal leaderboards.</p>
                ) : (
                  <div className={styles.leaderboardList}>
                    {personalLeaderboards.map((row) => (
                      <div key={row.label} className={styles.leaderboardRow}>
                        <strong>{row.label}</strong>
                        <span>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.insightCard}>
                <h4>Workout PR board</h4>
                {workoutLeaderboard.length === 0 ? (
                  <p className={styles.muted}>Add workouts with sets, reps, and load to build your PR board.</p>
                ) : (
                  <div className={styles.leaderboardList}>
                    {workoutLeaderboard.map((entry) => (
                      <div key={entry.exercise} className={styles.leaderboardRow}>
                        <strong>{entry.exercise}</strong>
                        <span>{entry.topWeight} {weightUnit} top set | est. 1RM {entry.estimatedOneRepMax} {weightUnit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.insightCard}>
                <h4>Achievements</h4>
                {achievements.length === 0 ? (
                  <p className={styles.muted}>Your first achievements will unlock automatically as you log data.</p>
                ) : (
                  <div className={styles.badgeList}>
                    {achievements.map((achievement) => <span key={achievement} className={styles.badge}>{achievement}</span>)}
                  </div>
                )}
              </div>

              <h4>Recent logs</h4>
              <div className={styles.scrollBox}>
                {allLogs.length === 0 && <p className={styles.muted}>No logs yet.</p>}
                {allLogs.map((row) => (
                  <button
                    key={row.date}
                    className={styles.logRow}
                    onClick={() => setSelectedDate(row.date)}
                  >
                    <strong>{row.date}</strong>
                    <span>{row.weight} {row.weightUnit}</span>
                    <span>{row.caloriesIn} kcal</span>
                    <span>{formatGoalLabel(row.goalType)}</span>
                  </button>
                ))}
              </div>

              <h4>Edit/delete history (audit)</h4>
              <div className={styles.scrollBox}>
                {auditRows.length === 0 && <p className={styles.muted}>No history entries yet.</p>}
                {auditRows.map((row) => (
                  <div key={row.id} className={styles.auditRow}>
                    <strong>{row.action.toUpperCase()}</strong>
                    <span>{row.logDate}</span>
                    <span>{row.timestamp || "pending timestamp"}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
