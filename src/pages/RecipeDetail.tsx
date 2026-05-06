import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  Users,
  ChefHat,
  Flame,
  Check,
  Timer,
  Sparkles,
  UtensilsCrossed,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { recipeApi } from "@/lib/api";

// --- Types (loose enough to match your backend doc shape) ---
type Recipe = {
  title: string;
  description?: string;
  cookingTime?: number;
  prepTime?: number;
  calories?: number | null;
  ingredients: { name: string; amount?: string }[];
  instructions: string[];
};

type GeneratedSessionDoc = {
  session_id: string;
  confirmed?: boolean;
  confirmed_at?: string | null;
  current_recipe?: Recipe; // <-- your backend stores recipe in session doc
};

export default function RecipeDetail() {
  const navigate = useNavigate();
  const { id: sessionId } = useParams(); // IMPORTANT: id is actually session_id from backend
  const [searchParams] = useSearchParams();
  const servings = searchParams.get("servings") || "4";

  const userId = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u?.id ?? "";
    } catch {
      return "";
    }
  }, []);

  const [doc, setDoc] = useState<GeneratedSessionDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!userId) navigate("/signin");
  }, [userId, navigate]);

  // Load session from backend
  useEffect(() => {
    const load = async () => {
      if (!sessionId || !userId) return;
      setLoading(true);
      try {
        const d = await recipeApi.getGeneratedBySession(sessionId, userId);
        setDoc(d);
      } catch (e) {
        console.error("Failed to load session:", e);
        setDoc(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionId, userId]);

  const recipe: Recipe | null = doc?.current_recipe ?? null;
  const isConfirmed = !!doc?.confirmed;

  const handleConfirmCooking = async () => {
    if (!sessionId || !userId) return;
    setConfirming(true);
    try {
      await recipeApi.confirm({ session_id: sessionId, user_id: userId });

      // refresh session to reflect confirmed=true
      const refreshed = await recipeApi.getGeneratedBySession(sessionId, userId);
      setDoc(refreshed);
    } catch (e) {
      console.error("Confirm failed:", e);
    } finally {
      setConfirming(false);
    }
  };

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const progress = useMemo(() => {
    if (!recipe?.instructions?.length) return 0;
    return Math.round((completedSteps.size / recipe.instructions.length) * 100);
  }, [completedSteps.size, recipe?.instructions?.length]);

  const quickInfoItems = useMemo(() => {
    const prep = recipe?.prepTime ?? 0;
    const cook = recipe?.cookingTime ?? 0;
    const cal = recipe?.calories ?? "—";
    return [
      { icon: Timer, label: "Prep Time", value: prep ? `${prep} min` : "—", gradient: "from-accent/30 to-accent/10", iconColor: "text-accent-foreground" },
      { icon: Clock, label: "Cook Time", value: cook ? `${cook} min` : "—", gradient: "from-primary/20 to-primary/5", iconColor: "text-primary" },
      { icon: Users, label: "Servings", value: servings, gradient: "from-honey/30 to-honey/10", iconColor: "text-foreground" },
      { icon: Flame, label: "Calories", value: String(cal), gradient: "from-terracotta/30 to-terracotta/10", iconColor: "text-foreground" },
    ];
  }, [recipe, servings]);

  if (loading) return <div className="max-w-5xl mx-auto p-6">Loading...</div>;
  if (!recipe) return <div className="max-w-5xl mx-auto p-6">Recipe not found.</div>;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back Button */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="gap-2 text-muted-foreground hover:text-foreground group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to recipes
        </Button>
      </motion.div>

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative rounded-3xl overflow-hidden mb-8 shadow-elevated">
        <div className="bg-gradient-to-br from-primary/20 via-accent/15 to-honey/20 p-8 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--accent)/0.2),_transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_hsl(var(--honey)/0.15),_transparent_60%)]" />
          <div className="relative z-10">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary shadow-elevated mb-5"
            >
              <ChefHat className="h-8 w-8 text-primary-foreground" />
            </motion.div>
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-foreground mb-3 leading-tight">
              {recipe.title}
            </h1>
            {recipe.description && (
              <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed">
                {recipe.description}
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Quick Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {quickInfoItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.05 }}
            className={cn("relative overflow-hidden rounded-2xl border border-border shadow-soft p-5", "bg-gradient-to-br", item.gradient)}
          >
            <div className="flex flex-col items-center text-center">
              <div className="h-10 w-10 rounded-xl bg-card/80 flex items-center justify-center mb-3 shadow-soft">
                <item.icon className={cn("h-5 w-5", item.iconColor)} />
              </div>
              <p className="text-xl font-bold text-foreground">{item.value}</p>
              <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Progress */}
      {completedSteps.size > 0 && recipe.instructions?.length > 0 && (
        <motion.div initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }} className="mb-8 bg-card rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Cooking Progress</span>
            <span className="text-sm font-bold text-primary">{progress}%</span>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
            />
          </div>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Ingredients */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2">
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden sticky top-6">
            <div className="bg-gradient-to-r from-secondary/50 to-accent/10 px-6 py-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center shadow-soft">
                  <ListChecks className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-semibold text-foreground">Ingredients</h2>
                  <p className="text-sm text-muted-foreground">{recipe.ingredients?.length ?? 0} items needed</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-2">
              {(recipe.ingredients || []).map((ingredient, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * index }}
                  className={cn(
                    "flex items-center justify-between p-3.5 rounded-xl transition-all duration-300",
                    isConfirmed
                      ? "bg-gradient-to-r from-primary/15 to-accent/10 border border-primary/25"
                      : "bg-gradient-to-r from-secondary/40 to-secondary/20 border border-border/50 hover:border-primary/20 hover:shadow-soft"
                  )}
                >
                  <span className={cn("text-sm font-medium transition-all", isConfirmed ? "text-muted-foreground line-through" : "text-foreground")}>
                    {ingredient.name}
                  </span>
                  <span className={cn("text-xs font-medium px-3 py-1.5 rounded-lg transition-all", isConfirmed ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground shadow-soft")}>
                    {ingredient.amount ?? ""}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="p-5 pt-0">
              <Button
                variant={isConfirmed ? "secondary" : "hero"}
                size="lg"
                className="w-full h-12 rounded-xl"
                onClick={handleConfirmCooking}
                disabled={isConfirmed || confirming}
              >
                {isConfirmed ? (
                  <>
                    <Check className="h-5 w-5" />
                    Ingredients Confirmed
                  </>
                ) : confirming ? (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Confirm & Start Cooking
                  </>
                )}
              </Button>

              {isConfirmed && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Pantry quantities have been reduced
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Instructions */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }} className="lg:col-span-3">
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-secondary/30 px-6 py-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center shadow-soft">
                  <UtensilsCrossed className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-semibold text-foreground">Instructions</h2>
                  <p className="text-sm text-muted-foreground">Follow step by step</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {(recipe.instructions || []).map((instruction, index) => {
                const isCompleted = completedSteps.has(index);
                return (
                  <motion.div
                    key={index}
                    whileTap={{ scale: 0.99 }}
                    className={cn(
                      "flex gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200 border-2",
                      isCompleted ? "bg-primary/5 border-primary/20" : "hover:bg-secondary/30 border-transparent hover:border-primary/10"
                    )}
                    onClick={() => toggleStep(index)}
                  >
                    <motion.div
                      animate={isCompleted ? { scale: [1, 1.2, 1] } : {}}
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all font-bold text-sm",
                        isCompleted ? "bg-primary text-primary-foreground shadow-soft" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <Check className="h-5 w-5" /> : index + 1}
                    </motion.div>
                    <p className={cn("text-sm leading-relaxed pt-2 transition-all", isCompleted ? "text-muted-foreground" : "text-foreground")}>
                      {instruction}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom CTA */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-10">
        <div className="bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/20 rounded-2xl border border-primary/20 p-6 md:p-8 shadow-card">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary shadow-elevated flex items-center justify-center">
                <ChefHat className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <p className="font-serif text-xl font-semibold text-foreground">Ready for more?</p>
                <p className="text-muted-foreground">Generate another delicious recipe from your pantry</p>
              </div>
            </div>
            <Button variant="hero" size="lg" onClick={() => navigate("/generate-recipe")} className="h-14 px-8 rounded-xl shadow-elevated">
              <Sparkles className="h-5 w-5" />
              Generate Another Recipe
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}