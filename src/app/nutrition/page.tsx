"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { User } from "firebase/auth";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";
import Image from "next/image";
import AppShell from "@/components/AppShell";
import common from "../common.module.css";
import { db, storage } from "@/lib/firebase";
import { DietRestriction, MealEntry, NutritionLog } from "@/lib/types";
import {
  DIET_RESTRICTION_OPTIONS,
  ESSENTIAL_VITAMINS_BY_AGE,
  formatDate,
  formatDietRestrictionLabel,
  macroCalories,
  mealIdeasFromHistory,
  vitaminFoodSuggestions,
} from "@/lib/fitness";

function emptyMeal(): MealEntry {
  return {
    mealName: "Meal",
    description: "",
    caloriesKcal: NaN,
    estimatedCaloriesKcal: 0,
    macros: { proteinG: 0, carbsG: 0, fatG: 0 },
    ingredients: [],
    time: "",
  };
}

function NutritionContent({ user }: { user: User }) {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [proteinG, setProteinG] = useState("150");
  const [carbsG, setCarbsG] = useState("220");
  const [fatG, setFatG] = useState("60");
  const [caloriesKcal, setCaloriesKcal] = useState("0");
  const [dietRestrictions, setDietRestrictions] = useState<DietRestriction[]>(["none"]);
  const [meals, setMeals] = useState<MealEntry[]>([emptyMeal()]);
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const macroTotalCalories = useMemo(() => {
    return macroCalories({
      proteinG: Number(proteinG) || 0,
      carbsG: Number(carbsG) || 0,
      fatG: Number(fatG) || 0,
    });
  }, [proteinG, carbsG, fatG]);

  const totalEstimatedMealCalories = useMemo(() => {
    return meals.reduce((sum, meal) => sum + macroCalories(meal.macros), 0);
  }, [meals]);

  useEffect(() => {
    setCaloriesKcal(String(macroTotalCalories));
  }, [macroTotalCalories]);

  async function loadNutritionLogs() {
    if (!db) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "users", user.uid, "nutritionLogs"));
      const rows = snap.docs.map((d) => d.data() as NutritionLog);
      setLogs(rows);
      const existing = rows.find((r) => r.date === selectedDate);
      if (existing) {
        setProteinG(String(existing.macros.proteinG));
        setCarbsG(String(existing.macros.carbsG));
        setFatG(String(existing.macros.fatG));
        setCaloriesKcal(String(existing.caloriesKcal));
        setDietRestrictions(existing.dietRestrictions?.length ? existing.dietRestrictions : ["none"]);
        setMeals(
          existing.meals?.length
            ? existing.meals.map((meal) => ({
                ...meal,
                ingredients: meal.ingredients || [],
                estimatedCaloriesKcal: meal.estimatedCaloriesKcal ?? macroCalories(meal.macros),
              }))
            : [emptyMeal()],
        );
        setNotes(existing.notes || "");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNutritionLogs();
  }, [user.uid, selectedDate]);

  function toggleRestriction(value: DietRestriction) {
    setDietRestrictions((prev) => {
      if (value === "none") return ["none"];
      const withoutNone = prev.filter((v) => v !== "none");
      if (withoutNone.includes(value)) {
        const filtered = withoutNone.filter((v) => v !== value);
        return filtered.length ? filtered : ["none"];
      }
      return [...withoutNone, value];
    });
  }

  function setMealAt(index: number, next: MealEntry) {
    setMeals((rows) => rows.map((row, idx) => (idx === index ? next : row)));
  }

  function updateMealMacrosWithAutofill(index: number, nextMacros: MealEntry["macros"]) {
    setMeals((rows) => rows.map((row, idx) => {
      if (idx !== index) return row;
      const estimated = macroCalories(nextMacros);
      const hasManualCalories = Number.isFinite(row.caloriesKcal) && row.caloriesKcal > 0;
      return {
        ...row,
        macros: nextMacros,
        estimatedCaloriesKcal: estimated,
        caloriesKcal: hasManualCalories ? row.caloriesKcal : estimated,
      };
    }));
  }

  async function handleMealPhotoUpload(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !storage) return;
    setError("");
    setMessage("");
    if (file.size > 8 * 1024 * 1024) {
      setError("Meal image must be below 8MB.");
      return;
    }
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `users/${user.uid}/mealPhotos/${selectedDate}-${index}-${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setMeals((rows) => rows.map((row, idx) => (idx === index ? { ...row, photoUrl: url } : row)));
      setMessage("Meal photo uploaded.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSave() {
    if (!db) return;
    setError("");
    setMessage("");

    const cleanMeals = meals
      .filter((meal) => meal.description.trim() || meal.caloriesKcal > 0 || (meal.ingredients?.length || 0) > 0)
      .map((meal) => ({
        ...meal,
        ingredients: (meal.ingredients || []).map((i) => i.trim()).filter(Boolean),
        estimatedCaloriesKcal: macroCalories(meal.macros),
        caloriesKcal: Number.isFinite(meal.caloriesKcal) && meal.caloriesKcal > 0
          ? meal.caloriesKcal
          : macroCalories(meal.macros),
      }));
    if (!cleanMeals.length) {
      setError("Add at least one meal entry.");
      return;
    }

    const payload: NutritionLog = {
      date: selectedDate,
      caloriesKcal: Number(caloriesKcal) || 0,
      macros: {
        proteinG: Number(proteinG) || 0,
        carbsG: Number(carbsG) || 0,
        fatG: Number(fatG) || 0,
      },
      meals: cleanMeals,
      dietRestrictions,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "users", user.uid, "nutritionLogs", selectedDate), payload, { merge: true });
      setMessage("Nutrition log saved.");
      void loadNutritionLogs();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const mealIdeas = useMemo(() => {
    return mealIdeasFromHistory({ logs, restrictions: dietRestrictions });
  }, [logs, dietRestrictions]);

  const chartData = useMemo(() => {
    return logs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((log) => ({
        date: log.date.slice(5),
        calories: log.caloriesKcal,
        protein: log.macros.proteinG,
      }));
  }, [logs]);

  const vitaminsForCurrentProfile = useMemo(() => {
    return ESSENTIAL_VITAMINS_BY_AGE.map((group) => ({
      ...group,
      foods: group.vitamins.map((v) => ({
        vitamin: v,
        foods: vitaminFoodSuggestions(v, dietRestrictions),
      })),
    }));
  }, [dietRestrictions]);

  return (
    <>
      <section className={common.card}>
        <h2>Nutrition</h2>
        <p className={common.muted}>
          Track macros, calories, diet restrictions, meals, and meal photos. Use your nutrition history to generate meal ideas.
        </p>

        <div className={common.formGrid}>
          <label>
            Date
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
        </div>
      </section>

      <section className={common.card}>
        <h3>Calories & macros</h3>
        <div className={common.formGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <label>
            Protein (g)
            <input type="number" value={proteinG} onChange={(e) => setProteinG(e.target.value)} min="0" />
          </label>
          <label>
            Carbs (g)
            <input type="number" value={carbsG} onChange={(e) => setCarbsG(e.target.value)} min="0" />
          </label>
          <label>
            Fat (g)
            <input type="number" value={fatG} onChange={(e) => setFatG(e.target.value)} min="0" />
          </label>
          <label>
            Calories (kcal)
            <input type="number" value={caloriesKcal} onChange={(e) => setCaloriesKcal(e.target.value)} min="0" />
          </label>
        </div>
        <div className={common.metrics}>
          <span>Macro-derived calories: {macroTotalCalories} kcal</span>
          <span>Meal-estimated calories: {totalEstimatedMealCalories} kcal</span>
        </div>
      </section>

      <section className={common.card}>
        <h3>Diet restrictions</h3>
        <p className={common.muted}>Select all that apply. This affects vitamin food suggestions and meal ideas.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {DIET_RESTRICTION_OPTIONS.map((option) => {
            const active = dietRestrictions.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleRestriction(option)}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  background: active ? "#0f766e" : "#eef2f7",
                  color: active ? "#fff" : "#1f2937",
                }}
              >
                {formatDietRestrictionLabel(option)}
              </button>
            );
          })}
        </div>
      </section>

      <section className={common.card}>
        <h3>Meals throughout the day</h3>
        <div className={common.formGrid}>
          {meals.map((meal, index) => (
            <div key={index} className={common.rowCard}>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <label>
                  Meal label
                  <input
                    value={meal.mealName}
                    onChange={(e) => setMealAt(index, { ...meal, mealName: e.target.value })}
                    placeholder="Breakfast / Lunch / Dinner"
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={meal.time || ""}
                    onChange={(e) => setMealAt(index, { ...meal, time: e.target.value })}
                  />
                </label>
                <label>
                  Calories
                  <input
                    type="number"
                    min="0"
                    value={Number.isFinite(meal.caloriesKcal) ? meal.caloriesKcal : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setMealAt(index, {
                        ...meal,
                        caloriesKcal: raw === "" ? NaN : Number(raw),
                      });
                    }}
                    placeholder={String(macroCalories(meal.macros))}
                  />
                </label>
              </div>

              <label>
                Description
                <input
                  value={meal.description}
                  onChange={(e) => setMealAt(index, { ...meal, description: e.target.value })}
                  placeholder="e.g. grilled salmon, quinoa, spinach"
                />
              </label>

              <label>
                Ingredients (comma-separated)
                <input
                  value={(meal.ingredients || []).join(", ")}
                  onChange={(e) => {
                    const parsed = e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean);
                    setMealAt(index, { ...meal, ingredients: parsed });
                  }}
                  placeholder="e.g. chicken breast, brown rice, broccoli"
                />
              </label>

              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                <label>
                  Protein (g)
                  <input
                    type="number"
                    min="0"
                    value={meal.macros.proteinG}
                    onChange={(e) => updateMealMacrosWithAutofill(index, { ...meal.macros, proteinG: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  Carbs (g)
                  <input
                    type="number"
                    min="0"
                    value={meal.macros.carbsG}
                    onChange={(e) => updateMealMacrosWithAutofill(index, { ...meal.macros, carbsG: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  Fat (g)
                  <input
                    type="number"
                    min="0"
                    value={meal.macros.fatG}
                    onChange={(e) => updateMealMacrosWithAutofill(index, { ...meal.macros, fatG: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>

              <div className={common.metrics}>
                <span>Estimated calories from meal macros: {macroCalories(meal.macros)} kcal</span>
              </div>

              <div className={common.ctaRow}>
                <input
                  ref={(el) => {
                    fileRefs.current[`meal-${index}`] = el;
                  }}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => void handleMealPhotoUpload(index, e)}
                />
                <button type="button" className={common.secondaryBtn} onClick={() => fileRefs.current[`meal-${index}`]?.click()}>
                  {meal.photoUrl ? "Change meal photo" : "Upload meal photo"}
                </button>
                <button
                  type="button"
                  className={common.smallBtn}
                  onClick={() => setMeals((rows) => (rows.length === 1 ? rows : rows.filter((_, idx) => idx !== index)))}
                >
                  Remove meal
                </button>
              </div>

              {meal.photoUrl && (
                <div style={{ marginTop: 8 }}>
                  <Image src={meal.photoUrl} alt="Meal photo" width={140} height={100} style={{ borderRadius: 10, objectFit: "cover" }} unoptimized />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={common.ctaRow}>
          <button type="button" className={common.secondaryBtn} onClick={() => setMeals((rows) => [...rows, emptyMeal()])}>
            + Add meal
          </button>
        </div>
      </section>

      <section className={common.card}>
        <h3>Essential vitamins by age group</h3>
        <p className={common.muted}>Food suggestions are adjusted based on your selected diet restrictions.</p>
        <div className={common.listBox}>
          {vitaminsForCurrentProfile.map((group) => (
            <div key={group.group} className={common.rowCard}>
              <strong>{group.group}</strong>
              {group.foods.map((entry) => (
                <span key={`${group.group}-${entry.vitamin}`}>
                  {entry.vitamin}: {entry.foods.join(", ")}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={common.card}>
        <h3>Meal ideas from your history</h3>
        <div className={common.listBox}>
          {mealIdeas.length === 0 ? (
            <p className={common.muted}>Log a few meals first, then this section will suggest meals from your patterns.</p>
          ) : (
            mealIdeas.map((idea) => (
              <div key={idea} className={common.rowCard}>
                <span>{idea}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={common.card}>
        <h3>Nutrition trend (last 30 days)</h3>
        {chartData.length === 0 ? (
          <p className={common.muted}>No nutrition logs yet.</p>
        ) : (
          <div className={common.chartWrap}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="calories" stroke="#0f766e" strokeWidth={2} name="Calories" />
                <Line yAxisId="right" type="monotone" dataKey="protein" stroke="#b45309" strokeWidth={2} name="Protein (g)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className={common.card}>
        <h3>Save</h3>
        <div className={common.formGrid}>
          <label>
            Notes
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did nutrition feel today?" />
          </label>
        </div>
        <div className={common.ctaRow}>
          <button className={common.primaryBtn} onClick={handleSave} disabled={loading}>
            Save nutrition log
          </button>
        </div>
        {message && <p className={common.success}>{message}</p>}
        {error && <p className={common.error}>{error}</p>}
      </section>
    </>
  );
}

export default function NutritionPage() {
  return (
    <AppShell
      title="Nutrition"
      subtitle="Plan and track meals, macros, vitamins, and food choices that align with your dietary restrictions."
      description="Use this page to log daily nutrition details, meal photos, and dietary preferences, then review vitamin guidance and personalized meal ideas."
    >
      {(user) => <NutritionContent user={user} />}
    </AppShell>
  );
}
