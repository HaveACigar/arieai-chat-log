"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  GOAL_OPTIONS,
  SEX_OPTIONS,
  UNIT_OPTIONS,
  buildAutoActivitySuggestion,
  calculateMaintenanceCalories,
  formatDate,
  toKg,
} from "@/lib/fitness";
import {
  ActivityLevel,
  DailyLog,
  ExerciseEntry,
  GoalType,
  Profile,
  WeightUnit,
} from "@/lib/types";

const FIXED_HEIGHT_CM = 188;
const MAX_PHOTO_SIZE_MB = 20;

function makeEmptyExercise(): ExerciseEntry {
  return {
    name: "",
    durationMin: 30,
    caloriesBurned: 0,
    intensity: "moderate",
  };
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
  const [caloriesIn, setCaloriesIn] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("maintenance");
  const [manualActivityLevel, setManualActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [sex, setSex] = useState<Profile["sex"]>("male");
  const [age, setAge] = useState("30");
  const [notes, setNotes] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]);
  const [exercises, setExercises] = useState<ExerciseEntry[]>([makeEmptyExercise()]);

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
        setPhotoFiles([]);
        setExistingPhotoUrls([]);
        setExercises([makeEmptyExercise()]);
        setNotes("");
        setWeight("");
        setCaloriesIn("");
        return;
      }
      const row = snap.data() as DailyLog;
      setWeight(String(row.weight));
      setWeightUnit(row.weightUnit);
      setCaloriesIn(String(row.caloriesIn));
      setGoalType(row.goalType);
      setManualActivityLevel(row.activityLevel);
      setSex(row.sex);
      setAge(String(row.age));
      setNotes(row.notes || "");
      setExistingPhotoUrls(row.photoUrls || []);
      setExercises(row.exercises?.length ? row.exercises : [makeEmptyExercise()]);
      setPhotoFiles([]);
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

  async function uploadSelectedPhotos(uid: string): Promise<string[]> {
    if (!storage) return [];
    if (!photoFiles.length) return [];
    const uploaded: string[] = [];
    for (const file of photoFiles) {
      if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
        throw new Error(`${file.name} exceeds ${MAX_PHOTO_SIZE_MB}MB.`);
      }
      const key = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const storageRef = ref(storage, `users/${uid}/photos/${selectedDate}/${key}`);
      await uploadBytes(storageRef, file);
      uploaded.push(await getDownloadURL(storageRef));
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
      if (!Number.isFinite(weightVal) || weightVal <= 0) {
        throw new Error("Weight must be a positive number.");
      }
      if (!Number.isFinite(caloriesInVal) || caloriesInVal < 0) {
        throw new Error("Calories eaten must be zero or higher.");
      }
      if (!Number.isFinite(ageVal) || ageVal <= 0) {
        throw new Error("Age must be a positive number.");
      }

      const cleanExercises = exercises
        .filter((x) => x.name.trim())
        .map((x) => ({
          name: x.name.trim(),
          durationMin: Number(x.durationMin) || 0,
          caloriesBurned: Number(x.caloriesBurned) || 0,
          intensity: x.intensity,
        }));
      const totalExerciseCalories = cleanExercises.reduce((sum, x) => sum + x.caloriesBurned, 0);

      const docRef = doc(db, "users", user.uid, "dailyLogs", selectedDate);
      const existing = await getDoc(docRef);
      const uploadedUrls = await uploadSelectedPhotos(user.uid);
      const mergedPhotos = [...existingPhotoUrls, ...uploadedUrls];

      const nextLog: DailyLog = {
        date: selectedDate,
        weight: weightVal,
        weightUnit,
        caloriesIn: caloriesInVal,
        caloriesMaintenance: maintenance || 0,
        goalType,
        activityLevel: manualActivityLevel,
        sex,
        age: ageVal,
        heightCm: FIXED_HEIGHT_CM,
        notes,
        exercises: cleanExercises,
        totalExerciseCalories,
        photoUrls: mergedPhotos,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(docRef, nextLog, { merge: true });
      await setDoc(doc(db, "users", user.uid, "profile", "main"), {
        sex,
        age: ageVal,
        defaultWeightUnit: weightUnit,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await addDoc(collection(db, "users", user.uid, "auditTrail"), {
        action: existing.exists() ? "update" : "create",
        logDate: selectedDate,
        timestamp: serverTimestamp(),
        before: existing.exists() ? existing.data() : null,
        after: nextLog,
      });

      setExistingPhotoUrls(mergedPhotos);
      setPhotoFiles([]);
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
      setCaloriesIn("");
      setExercises([makeEmptyExercise()]);
      setExistingPhotoUrls([]);
      setPhotoFiles([]);
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

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1>ArieAI Fitness Log</h1>
        <p>
          Multi-user daily logging with photos, calorie tracking, exercise analytics, maintenance estimates, and a full edit/delete audit trail.
        </p>
      </section>

      {!user ? (
        <section className={styles.authCard}>
          <h2>Sign in to your account</h2>
          {!firebaseReady && (
            <p className={styles.error}>Add Firebase env vars in .env.local before signing in.</p>
          )}
          <button className={styles.googleBtn} onClick={handleGoogleLogin} disabled={!firebaseReady}>Continue with Google</button>
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
            <button className={styles.linkBtn} onClick={() => { if (auth) void signOut(auth); }}>Sign out</button>
          </section>

          <section className={styles.grid}>
            <article className={styles.card}>
              <h3>Daily log</h3>
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
                  Calories eaten
                  <input type="number" value={caloriesIn} onChange={(e) => setCaloriesIn(e.target.value)} />
                </label>
                <label>
                  Goal mode
                  <select value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)}>
                    {GOAL_OPTIONS.map((goal) => <option key={goal} value={goal}>{goal.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
                <label>
                  Sex
                  <select value={sex} onChange={(e) => setSex(e.target.value as Profile["sex"])}>
                    {SEX_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label>
                  Age
                  <input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
                </label>
                <label>
                  Activity level
                  <select value={manualActivityLevel} onChange={(e) => setManualActivityLevel(e.target.value as ActivityLevel)}>
                    {EXERCISE_LEVEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>
                <label>
                  Suggested activity level
                  <input value={autoActivitySuggestion} disabled />
                </label>
              </div>

              <h4>Exercises</h4>
              <div className={styles.exerciseList}>
                {exercises.map((exercise, index) => (
                  <div className={styles.exerciseRow} key={`${exercise.name}-${index}`}>
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
                      className={styles.smallBtn}
                      onClick={() => setExercises((rows) => rows.length === 1 ? rows : rows.filter((_, idx) => idx !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button className={styles.secondaryBtn} onClick={() => setExercises((rows) => [...rows, makeEmptyExercise()])}>Add exercise</button>

              <h4>Photos (optional)</h4>
              <label>
                Upload image files (0..many, up to {MAX_PHOTO_SIZE_MB}MB each)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
                />
              </label>
              {existingPhotoUrls.length > 0 && (
                <div className={styles.photoGrid}>
                  {existingPhotoUrls.map((url) => <img key={url} src={url} alt="log" />)}
                </div>
              )}

              <label>
                Notes
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </label>

              <div className={styles.metrics}>
                <span>Height: 6&apos;2&quot; ({FIXED_HEIGHT_CM} cm)</span>
                <span>Maintenance estimate: {maintenance ? `${maintenance} kcal` : "enter age + weight"}</span>
              </div>

              <div className={styles.ctaRow}>
                <button className={styles.primaryBtn} disabled={busy || loadingData} onClick={handleSaveLog}>Save log</button>
                <button className={styles.dangerBtn} disabled={busy || loadingData} onClick={handleDeleteLog}>Delete log</button>
              </div>
              {success && <p className={styles.success}>{success}</p>}
              {error && <p className={styles.error}>{error}</p>}
            </article>

            <article className={styles.card}>
              <h3>Progress dashboard</h3>
              <p className={styles.muted}>Starter charts use your saved daily logs. You can expand this into advanced analytics next.</p>
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
                    <span>{row.goalType.replaceAll("_", " ")}</span>
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
