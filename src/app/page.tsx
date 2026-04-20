"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc } from "firebase/firestore";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AppShell from "@/components/AppShell";
import common from "./common.module.css";
import { db } from "@/lib/firebase";
import { DailyLog, GoalType, Profile, WeightUnit } from "@/lib/types";
import { GOAL_OPTIONS, WEIGH_IN_CONTEXT_OPTIONS, calculateBmi, cmToFeetInches, formatDate, formatGoalLabel, toKg } from "@/lib/fitness";

function HomeContent({ user }: { user: User }) {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lb");
  const [boneMass, setBoneMass] = useState("");
  const [weighInContext, setWeighInContext] = useState("");
  const [caloriesIn, setCaloriesIn] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("maintenance");
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [heightCm, setHeightCm] = useState(188);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const bmi = useMemo(() => {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0) return null;
    return calculateBmi(toKg(value, weightUnit), heightCm);
  }, [weight, weightUnit, heightCm]);

  const chartData = useMemo(() => {
    return logs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => ({
        date: log.date.slice(5),
        weightKg: Number(toKg(log.weight, log.weightUnit).toFixed(2)),
        bmi: calculateBmi(toKg(log.weight, log.weightUnit), log.heightCm || heightCm),
      }));
  }, [logs, heightCm]);

  const heightInFtIn = useMemo(() => cmToFeetInches(heightCm), [heightCm]);
  const sortedLogsDesc = useMemo(() => {
    return logs.slice().sort((a, b) => b.date.localeCompare(a.date));
  }, [logs]);

  const hasExistingForSelectedDate = useMemo(() => {
    return logs.some((log) => log.date === selectedDate);
  }, [logs, selectedDate]);

  async function loadLogs(uid: string, date: string) {
    if (!db) return;
    setLoading(true);
    try {
      const profileSnap = await getDoc(doc(db, "users", uid, "profile", "main"));
      if (profileSnap.exists()) {
        const profile = profileSnap.data() as Partial<Profile>;
        if (profile.heightCm && profile.heightCm > 0) {
          setHeightCm(profile.heightCm);
        }
      }

      const snap = await getDocs(collection(db, "users", uid, "dailyLogs"));
      const rows = snap.docs.map((row) => row.data() as DailyLog);
      setLogs(rows);

      const single = await getDoc(doc(db, "users", uid, "dailyLogs", date));
      if (!single.exists()) {
        setWeight("");
        setBoneMass("");
        setWeighInContext("");
        setCaloriesIn("");
        setGoalType("maintenance");
        setNotes("");
        return;
      }
      const row = single.data() as DailyLog;
      setWeight(String(row.weight));
      setWeightUnit(row.weightUnit);
      setBoneMass(row.boneMass ? String(row.boneMass) : "");
      setWeighInContext(row.weighInContext || "");
      setCaloriesIn(String(row.caloriesIn || 0));
      setGoalType(row.goalType);
      setNotes(row.notes || "");
    } catch (err) {
      setError((err as Error).message || "Unable to load daily logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(user.uid, selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, selectedDate]);

  async function handleSave() {
          if (!db) return;
          setError("");
          setMessage("");
          const weightValue = Number(weight);
          const caloriesValue = Number(caloriesIn || "0");
          const boneMassValue = boneMass ? Number(boneMass) : null;
          if (!Number.isFinite(weightValue) || weightValue <= 0) {
            setError("Weight must be a positive number.");
            return;
          }
          if (!Number.isFinite(caloriesValue) || caloriesValue < 0) {
            setError("Calories must be zero or greater.");
            return;
          }
          if (boneMass && (!Number.isFinite(Number(boneMassValue)) || Number(boneMassValue) <= 0)) {
            setError("Bone mass must be a positive number if entered.");
            return;
          }

          const profileSnap = await getDoc(doc(db, "users", user.uid, "profile", "main"));
          const profile = (profileSnap.exists() ? profileSnap.data() : {}) as Partial<Profile>;

          const existingSnap = await getDoc(doc(db, "users", user.uid, "dailyLogs", selectedDate));
          const existing = existingSnap.exists() ? (existingSnap.data() as DailyLog) : null;

          const payload: DailyLog = {
            date: selectedDate,
            weight: weightValue,
            weightUnit,
            boneMass: boneMassValue || undefined,
            weighInContext: weighInContext || undefined,
            caloriesIn: caloriesValue,
            caloriesMaintenance: existing?.caloriesMaintenance || 0,
            goalType,
            activityLevel: existing?.activityLevel || "moderately_active",
            sex: profile.sex || existing?.sex || "male",
            age: profile.age || existing?.age || 30,
            heightCm,
            notes,
            exercises: existing?.exercises || [],
            workouts: existing?.workouts || [],
            totalExerciseCalories: existing?.totalExerciseCalories || 0,
            photoUrls: existing?.photoUrls || [],
            photoEntries: existing?.photoEntries || [],
            updatedAt: new Date().toISOString(),
          };

          await setDoc(doc(db, "users", user.uid, "dailyLogs", selectedDate), payload, { merge: true });
          setMessage("Daily metrics saved.");
          await loadLogs(user.uid, selectedDate);
        }

  async function handleDeleteLog(date: string) {
    if (!db) return;
    if (!window.confirm(`Delete metrics log for ${date}?`)) return;
    setError("");
    setMessage("");
    try {
      await deleteDoc(doc(db, "users", user.uid, "dailyLogs", date));
      if (selectedDate === date) {
        setWeight("");
        setBoneMass("");
        setWeighInContext("");
        setCaloriesIn("");
        setGoalType("maintenance");
        setNotes("");
      }
      setMessage(`Deleted metrics log for ${date}.`);
      await loadLogs(user.uid, selectedDate);
    } catch (err) {
      setError((err as Error).message || "Unable to delete metrics log.");
    }
  }

  return (
    <>
      <section className={common.card}>
              <h2>BMI / Weight Screen</h2>
              <p className={common.muted}>Main page focuses on weigh-ins, BMI, and core daily body metrics.</p>
              <div className={common.formGrid}>
                <label>
                  Date
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </label>
                <label>
                  Weight
                  <div className={common.inline}>
                    <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                    <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}>
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                </label>
                <label>
                  Weigh-in context (optional)
                  <select value={weighInContext} onChange={(e) => setWeighInContext(e.target.value)}>
                    <option value="">Choose context</option>
                    {WEIGH_IN_CONTEXT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Bone mass (optional)
                  <input type="number" step="0.1" value={boneMass} onChange={(e) => setBoneMass(e.target.value)} />
                </label>
                <label>
                  Calories eaten
                  <input type="number" value={caloriesIn} onChange={(e) => setCaloriesIn(e.target.value)} />
                </label>
                <label>
                  Diet mode
                  <select value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)}>
                    {GOAL_OPTIONS.map((goal) => <option key={goal} value={goal}>{formatGoalLabel(goal)}</option>)}
                  </select>
                </label>
                <label>
                  Notes
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>

              <div className={common.metrics}>
                <span>Height: {heightInFtIn.feet}&apos;{heightInFtIn.inches}&quot; ({heightCm} cm)</span>
                <span>BMI: {bmi ? bmi : "enter weight"}</span>
              </div>

              <div className={common.ctaRow}>
                <button className={common.primaryBtn} onClick={handleSave} disabled={loading}>
                  {hasExistingForSelectedDate ? "Update daily metrics" : "Save daily metrics"}
                </button>
                {hasExistingForSelectedDate && (
                  <button className={common.dangerBtn} onClick={() => void handleDeleteLog(selectedDate)} disabled={loading}>
                    Delete selected log
                  </button>
                )}
              </div>
              {message && <p className={common.success}>{message}</p>}
              {error && <p className={common.error}>{error}</p>}
          </section>

          <section className={common.card}>
              <h3>Edit or remove previous metrics logs</h3>
              <p className={common.muted}>Choose a date to edit, or remove logs you no longer want to keep.</p>
              <div className={common.listBox}>
                {sortedLogsDesc.length === 0 && <p className={common.muted}>No metrics logs yet.</p>}
                {sortedLogsDesc.slice(0, 30).map((log) => (
                  <div key={log.date} className={common.rowCard}>
                    <strong>{log.date}</strong>
                    <span>Weight: {log.weight} {log.weightUnit} | Calories: {log.caloriesIn}</span>
                    <div className={common.ctaRow}>
                      <button type="button" className={common.secondaryBtn} onClick={() => setSelectedDate(log.date)}>
                        Edit
                      </button>
                      <button type="button" className={common.dangerBtn} onClick={() => void handleDeleteLog(log.date)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
      </section>

          <section className={common.card}>
              <h3>Weight & BMI trend</h3>
              <div className={common.chartWrap}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Line yAxisId="left" type="monotone" dataKey="weightKg" stroke="#0f766e" strokeWidth={2} name="Weight (kg)" />
                    <Line yAxisId="right" type="monotone" dataKey="bmi" stroke="#1f2937" strokeWidth={2} name="BMI" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
      </section>
    </>
  );
}

export default function HomePage() {
  return (
    <AppShell
      title="ArieAI Fitness Home"
      subtitle="Track daily weight, BMI, calories, and notes in one place."
      description="Use this page for daily body metrics and calorie tracking. It is your baseline check-in before training, nutrition, and recovery decisions."
    >
      {(user) => <HomeContent user={user} />}
    </AppShell>
  );
}
