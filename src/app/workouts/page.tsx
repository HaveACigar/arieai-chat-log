"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AppShell from "@/components/AppShell";
import common from "../common.module.css";
import { db } from "@/lib/firebase";
import { WorkoutCategory, WorkoutEntry, WorkoutLog } from "@/lib/types";
import {
  WORKOUT_CATEGORY_OPTIONS,
  WORKOUT_PRESETS_BY_CATEGORY,
  calculateEstimatedOneRepMax,
  formatDate,
  formatWorkoutCategoryLabel,
} from "@/lib/fitness";

function makeEmptyEntry(): WorkoutEntry {
  return { exercise: "", sets: 3, reps: 8, weight: 0, notes: "" };
}

function WorkoutsContent({ user }: { user: User }) {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory>("chest");
  const [entries, setEntries] = useState<WorkoutEntry[]>([makeEmptyEntry()]);
  const [allLogs, setAllLogs] = useState<WorkoutLog[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadWorkouts() {
    if (!db) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "users", user.uid, "workoutLogs"));
      setAllLogs(snap.docs.map((d) => d.data() as WorkoutLog));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadWorkouts(); }, [user.uid]);

  const chartData = useMemo(() => {
    return allLogs
      .filter((log) => log.category === selectedCategory)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => {
        const topVolume = log.entries.reduce((sum, e) => sum + e.sets * e.reps * e.weight, 0);
        const topORM = Math.max(0, ...log.entries.map((e) => calculateEstimatedOneRepMax(e.weight, e.reps)));
        return { date: log.date.slice(5), volume: Math.round(topVolume), topORM };
      });
  }, [allLogs, selectedCategory]);

  const prs = useMemo(() => {
    const byExercise = new Map<string, number>();
    allLogs
      .filter((log) => log.category === selectedCategory)
      .forEach((log) => {
        log.entries.forEach((e) => {
          const orm = calculateEstimatedOneRepMax(e.weight, e.reps);
          if (!byExercise.has(e.exercise) || orm > byExercise.get(e.exercise)!) {
            byExercise.set(e.exercise, orm);
          }
        });
      });
    return Array.from(byExercise.entries()).sort((a, b) => b[1] - a[1]);
  }, [allLogs, selectedCategory]);

  async function handleSave() {
    if (!db) return;
    setError("");
    setMessage("");
    const clean = entries.filter((e) => e.exercise.trim());
    if (!clean.length) {
      setError("Add at least one exercise.");
      return;
    }
    const totalVolume = clean.reduce((sum, e) => sum + e.sets * e.reps * e.weight, 0);
    const payload: WorkoutLog = {
      date: selectedDate,
      category: selectedCategory,
      entries: clean,
      totalVolume,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "users", user.uid, "workoutLogs", `${selectedDate}-${selectedCategory}`), payload, { merge: true });
    setMessage("Workout saved.");
    void loadWorkouts();
  }

  const presets = WORKOUT_PRESETS_BY_CATEGORY[selectedCategory];

  return (
    <>
      <section className={common.card}>
        <h2>Workouts</h2>
        <p className={common.muted}>Select a workout type to filter exercises, log sets/reps/load, and build your PR board.</p>

        <div className={common.formGrid}>
          <label>
            Date
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
          <label>
            Workout type
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {WORKOUT_CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    background: selectedCategory === category ? "#0f766e" : "#eef2f7",
                    color: selectedCategory === category ? "white" : "#1f2937",
                  }}
                >
                  {formatWorkoutCategoryLabel(category)}
                </button>
              ))}
            </div>
          </label>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
        <section className={common.card}>
          <h3>Log sets for — {formatWorkoutCategoryLabel(selectedCategory)}</h3>
          <datalist id="exercise-presets">
            {presets.map((preset) => <option key={preset} value={preset} />)}
          </datalist>
          <div className={common.formGrid} style={{ gap: 10, marginTop: 10 }}>
            {entries.map((entry, index) => (
              <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1.4fr) 70px 70px 110px auto", gap: 8, alignItems: "start" }}>
                <input
                  list="exercise-presets"
                  placeholder={`${formatWorkoutCategoryLabel(selectedCategory)} exercise`}
                  value={entry.exercise}
                  onChange={(e) => setEntries((rows) => rows.map((row, idx) => idx === index ? { ...row, exercise: e.target.value } : row))}
                />
                <input
                  type="number"
                  placeholder="Sets"
                  value={entry.sets}
                  onChange={(e) => setEntries((rows) => rows.map((row, idx) => idx === index ? { ...row, sets: Number(e.target.value) } : row))}
                />
                <input
                  type="number"
                  placeholder="Reps"
                  value={entry.reps}
                  onChange={(e) => setEntries((rows) => rows.map((row, idx) => idx === index ? { ...row, reps: Number(e.target.value) } : row))}
                />
                <input
                  type="number"
                  placeholder="Load"
                  value={entry.weight}
                  onChange={(e) => setEntries((rows) => rows.map((row, idx) => idx === index ? { ...row, weight: Number(e.target.value) } : row))}
                />
                <button
                  type="button"
                  className={common.smallBtn}
                  onClick={() => setEntries((rows) => rows.length === 1 ? rows : rows.filter((_, idx) => idx !== index))}
                >
                  ×
                </button>
                <input
                  placeholder="Notes (optional)"
                  style={{ gridColumn: "1 / -1" }}
                  value={entry.notes || ""}
                  onChange={(e) => setEntries((rows) => rows.map((row, idx) => idx === index ? { ...row, notes: e.target.value } : row))}
                />
              </div>
            ))}
            <button type="button" className={common.secondaryBtn} onClick={() => setEntries((rows) => [...rows, makeEmptyEntry()])}>
              + Add exercise
            </button>
          </div>

          <div className={common.ctaRow}>
            <button className={common.primaryBtn} onClick={handleSave} disabled={loading}>Save workout</button>
          </div>
          {message && <p className={common.success}>{message}</p>}
          {error && <p className={common.error}>{error}</p>}
        </section>

        <section className={common.card}>
          <h3>PR board — {formatWorkoutCategoryLabel(selectedCategory)}</h3>
          {prs.length === 0 ? (
            <p className={common.muted}>No saved workouts for this category yet.</p>
          ) : (
            <div className={common.listBox}>
              {prs.map(([exercise, orm]) => (
                <div key={exercise} className={common.rowCard}>
                  <strong>{exercise}</strong>
                  <span>Est. 1RM: {orm} lb</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={common.card}>
        <h3>Volume & 1RM trend — {formatWorkoutCategoryLabel(selectedCategory)}</h3>
        <div className={common.chartWrap}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="volume" stroke="#0f766e" strokeWidth={2} name="Total volume" />
              <Line yAxisId="right" type="monotone" dataKey="topORM" stroke="#b45309" strokeWidth={2} name="Top est. 1RM" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}

export default function WorkoutsPage() {
  return (
    <AppShell
      title="Workouts"
      subtitle="Track strength by category, log PRs, and watch volume grow over time."
      description="Use this page to record exercises, sets, reps, and load. It focuses on progression, PR tracking, and strength-volume trends."
    >
      {(user) => <WorkoutsContent user={user} />}
    </AppShell>
  );
}
