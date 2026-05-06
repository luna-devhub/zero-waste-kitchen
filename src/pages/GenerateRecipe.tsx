import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ChefHat, Sparkles, Leaf, Check, Utensils, Globe, UtensilsCrossed,
  Users, ChevronRight, Clock, Search, X, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { recipeApi } from "@/lib/api";
import axios from "axios";

type Ingredient = {
  id: string;
  name: string;
  category: string;
  expiryDate?: string | null;
};

type SharedUser = { user_id: string; username: string; permission: string };
type PantryOption = { label: string; value: string; ownerIds: string[] };

const cuisines = [
  { label: "Any Cuisine", value: "any" },
  { label: "Myanmar", value: "myanmar" },
  { label: "Thai", value: "thai" },
  { label: "Chinese", value: "chinese" },
  { label: "Japanese", value: "japanese" },
  { label: "Korean", value: "korean" },
  { label: "Vietnamese", value: "vietnamese" },
  { label: "Indian", value: "indian" },
  { label: "Italian", value: "italian" },
  { label: "Mexican", value: "mexican" },
  { label: "Mediterranean", value: "mediterranean" },
  { label: "Middle Eastern", value: "middle_eastern" },
  { label: "American", value: "american" },
  { label: "French", value: "french" },
  { label: "Other…", value: "other" },
];

const mealTypes = ["Any Meal", "Breakfast", "Lunch", "Dinner", "Salad", "Dessert"];
const dietaryOptions = ["Non-Specific", "Vegan", "Gluten-Free", "Low-Calorie", "Dairy-Free", "Sugar-Free"];

const DIETARY_EXCLUDED_CATEGORIES: Record<string, string[]> = {
  "Vegan":       ["Meat", "Dairy"],
  "Dairy-Free":  ["Dairy"],
  "Gluten-Free": ["Grains"],
};

const categoryColors: Record<string, string> = {
  Vegetables: "from-green-500/20 to-green-600/10 border-green-500/30",
  Fruits:     "from-orange-500/20 to-orange-600/10 border-orange-500/30",
  Dairy:      "from-amber-500/20 to-amber-600/10 border-amber-500/30",
  Meat:       "from-rose-500/20 to-rose-600/10 border-rose-500/30",
  Grains:     "from-yellow-600/20 to-yellow-700/10 border-yellow-600/30",
  Spices:     "from-red-500/20 to-red-600/10 border-red-500/30",
  Other:      "from-primary/20 to-primary/10 border-primary/30",
};

const categoryDotColors: Record<string, string> = {
  Vegetables: "bg-green-500",
  Fruits:     "bg-orange-500",
  Dairy:      "bg-amber-500",
  Meat:       "bg-rose-500",
  Grains:     "bg-yellow-600",
  Spices:     "bg-red-500",
  Other:      "bg-primary",
};

const categoryTextColors: Record<string, string> = {
  Vegetables: "text-green-600",
  Fruits:     "text-orange-500",
  Dairy:      "text-amber-600",
  Meat:       "text-rose-500",
  Grains:     "text-yellow-700",
  Spices:     "text-red-500",
  Other:      "text-primary",
};

const categoryHeaderBg: Record<string, string> = {
  Vegetables: "hover:bg-green-500/5",
  Fruits:     "hover:bg-orange-500/5",
  Dairy:      "hover:bg-amber-500/5",
  Meat:       "hover:bg-rose-500/5",
  Grains:     "hover:bg-yellow-600/5",
  Spices:     "hover:bg-red-500/5",
  Other:      "hover:bg-primary/5",
};

export default function GenerateRecipe() {
  const navigate = useNavigate();

  const userId = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u?.id ?? "";
    } catch { return ""; }
  })();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);       // near-expiry top-8 for display grid
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]); // full pantry for popup
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [showMainIngredientPopup, setShowMainIngredientPopup] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [popupSearch, setPopupSearch] = useState("");

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const [selectedCuisine, setSelectedCuisine] = useState("any");
  const [customCuisine, setCustomCuisine] = useState("");
  const [selectedMealType, setSelectedMealType] = useState("Any Meal");
  const [selectedDietary, setSelectedDietary] = useState<string | null>(null);
  const [selectedServings, setSelectedServings] = useState(2);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pantryOptions, setPantryOptions] = useState<PantryOption[]>([]);
  const [selectedPantry, setSelectedPantry] = useState<string>("my");

  type CheckItem = { name: string; amount?: string };
  const [showPopup, setShowPopup] = useState(false);
  const [inStock, setInStock] = useState<CheckItem[]>([]);
  const [needToBuy, setNeedToBuy] = useState<CheckItem[]>([]);
  const [popupSessionId, setPopupSessionId] = useState<string>("");
  const [recipeName, setRecipeName] = useState<string>("");

  const excludedCategories = useMemo(() => {
    if (!selectedDietary) return [];
    return DIETARY_EXCLUDED_CATEGORIES[selectedDietary] ?? [];
  }, [selectedDietary]);

  const filteredAllIngredients = useMemo(() => {
    if (excludedCategories.length === 0) return allIngredients;
    return allIngredients.filter((i) => !excludedCategories.includes(i.category));
  }, [allIngredients, excludedCategories]);

  // Category map for accordion — diet-filtered
  const ingredientsByCategory = useMemo(() => {
    const map: Record<string, Ingredient[]> = {};
    filteredAllIngredients.forEach((ing) => {
      if (!map[ing.category]) map[ing.category] = [];
      map[ing.category].push(ing);
    });
    Object.keys(map).forEach((cat) => {
      map[cat].sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });
    });
    return map;
  }, [filteredAllIngredients]);

  // Near-expiry for popup — diet-filtered, top 8
  const nearExpiryIngredients = useMemo(() => {
    return filteredAllIngredients
      .filter((i) => i.expiryDate)
      .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())
      .slice(0, 8);
  }, [filteredAllIngredients]);

  // Search-filtered view for popup
  const searchedIngredients = useMemo(() => {
    if (!popupSearch.trim()) return null; // null = not searching
    const q = popupSearch.toLowerCase();
    return filteredAllIngredients.filter((i) => i.name.toLowerCase().includes(q));
  }, [filteredAllIngredients, popupSearch]);

  // Category stats for the pantry summary bar
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    filteredAllIngredients.forEach((i) => {
      map[i.category] = (map[i.category] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredAllIngredients]);

  const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const toBackendMealType = (m: string) => {
    const x = m.trim().toLowerCase();
    return x === "any meal" ? "any meal" : x;
  };

  const toBackendDiet = (diet: string | null) => {
    if (!diet) return "non specific";
    const d = diet.trim().toLowerCase();
    if (d === "non-specific" || d === "non specific") return "non specific";
    if (d === "gluten-free" || d === "gluten free") return "gluten free";
    if (d === "low-calorie" || d === "low calorie") return "low calorie";
    if (d === "dairy-free" || d === "dairy free") return "dairy free";
    if (d === "sugar-free" || d === "sugar free") return "sugar free";
    if (d === "vegan") return "vegan";
    return d.replace(/\s+/g, "-");
  };

  useEffect(() => {
    const loadPantries = async () => {
      try {
        const res = await fetch(`http://localhost:8000/share/shared-with/${userId}`);
        if (!res.ok) throw new Error(`share fetch failed ${res.status}`);
        const shared: SharedUser[] = await res.json();
        const opts: PantryOption[] = [
          { label: "My Pantry", value: "my", ownerIds: [userId] },
          ...shared.map((u) => ({ label: `${u.username}'s Pantry`, value: `user:${u.user_id}`, ownerIds: [u.user_id] })),
          ...shared.map((u) => ({ label: `My + ${u.username}`, value: `my+user:${u.user_id}`, ownerIds: [userId, u.user_id] })),
        ];
        setPantryOptions(opts);
        setSelectedPantry("my");
      } catch (e) {
        console.error(e);
        setPantryOptions([{ label: "My Pantry", value: "my", ownerIds: [userId] }]);
        setSelectedPantry("my");
      }
    };
    loadPantries();
  }, [userId]);

  const selectedPantryObj = useMemo(
    () => pantryOptions.find((p) => p.value === selectedPantry),
    [pantryOptions, selectedPantry]
  );

  useEffect(() => { if (!userId) navigate("/signin"); }, [userId, navigate]);

  useEffect(() => {
    const fetchNearExpiry = async () => {
      try {
        const owners = selectedPantryObj?.ownerIds ?? [userId];
        const params = new URLSearchParams();
        params.set("viewer_id", userId);
        params.set("owner_ids", owners.join(","));
        params.set("limit", "8");
        if (selectedDietary) params.set("diet", toBackendDiet(selectedDietary));
        const res = await fetch(`http://localhost:8000/ingredients/near-expiry?${params.toString()}`);
        if (!res.ok) throw new Error(`near-expiry failed: ${res.status}`);
        const raw = await res.json();
        setIngredients((raw || []).map((x: any) => ({
          id: String(x.id ?? x._id ?? ""),
          name: String(x.name ?? ""),
          category: String(x.category ?? "Other"),
          expiryDate: x.expiryDate ?? null,
        })));
      } catch (err) {
        console.error("Failed to fetch near-expiry:", err);
        setIngredients([]);
      }
    };
    if (pantryOptions.length > 0) fetchNearExpiry();
  }, [userId, selectedDietary, selectedPantryObj, pantryOptions.length]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const owners = selectedPantryObj?.ownerIds ?? [userId];
        const results = await Promise.all(
          owners.map((id) =>
            fetch(`http://localhost:8000/ingredients/user/${id}`)
              .then((r) => r.ok ? r.json() : []).catch(() => [])
          )
        );
        const merged = results.flat();
        const seen = new Set<string>();
        const deduped = merged
          .map((x: any) => ({
            id: String(x.id ?? x._id ?? ""),
            name: String(x.name ?? ""),
            category: String(x.category ?? "Other"),
            expiryDate: x.expiryDate ?? null,
          }))
          .filter((i: Ingredient) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
        setAllIngredients(deduped);
      } catch (err) {
        console.error("Failed to fetch all ingredients:", err);
        setAllIngredients([]);
      }
    };
    if (pantryOptions.length > 0) fetchAll();
  }, [userId, selectedPantryObj, pantryOptions.length]);

  useEffect(() => {
    if (selectedIngredientId && !filteredAllIngredients.some((x) => x.id === selectedIngredientId)) {
      setSelectedIngredientId(null);
    }
  }, [selectedIngredientId, filteredAllIngredients]);

  const selectedIngredient = useMemo(
    () => filteredAllIngredients.find((x) => x.id === selectedIngredientId) ?? null,
    [selectedIngredientId, filteredAllIngredients]
  );

  const handleDietaryToggle = (option: string) => {
    setSelectedDietary((prev) => (prev === option ? null : option));
  };

  const handleGenerate = async () => {
    if (!userId) return navigate("/signin");
    setIsGenerating(true);
    try {
      const owners = selectedPantryObj?.ownerIds ?? [userId];
      const cuisineLabel =
        selectedCuisine === "other"
          ? (customCuisine.trim() || "Any Cuisine")
          : (cuisines.find((c) => c.value === selectedCuisine)?.label || "Any Cuisine");
      const toItem = (x: any): CheckItem => ({
        name: String(x.name ?? x.ingredient ?? x.item ?? ""),
        amount: x.amount != null ? String(x.amount) : x.required_amount != null ? String(x.required_amount) : undefined,
      });
      const result = await recipeApi.generate({
        user_id: userId,
        pantry_owner_ids: owners,
        cuisine_style: cuisineLabel,
        meal_type: toBackendMealType(selectedMealType),
        dietary_option: toBackendDiet(selectedDietary),
        servings: selectedServings,
        main_ingredient: selectedIngredient?.name ?? null,
        session_id: null,
      });
      console.log("API RESULT:", result);
      setPopupSessionId(result.session_id);
      setRecipeName(result.recipe?.title || "Generated Recipe");
      const cookable = result.pantry_check?.cookable_ingredients ?? result.pantry_check?.in_stock ?? [];
      const missing = result.shopping_list?.missing_ingredients ?? result.shopping_list?.need_to_buy ?? [];
      const cookableItems = (cookable || []).map(toItem).filter((x: any) => x.name);
      const missingItems = (missing || []).map(toItem).filter((x: any) => x.name);
      setInStock(cookableItems);
      setNeedToBuy(missingItems);
      if (missingItems.length === 0) navigate(`/recipe/${result.session_id}`);
      else setShowPopup(true);
    } catch (err) {
      if (axios.isAxiosError(err)) console.error("Generate failed:", err.response?.status, err.response?.data);
      else console.error("Generate failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Ingredient chip used in both near-expiry and category sections ──
  const IngredientChip = ({ ing, showDays = false }: { ing: Ingredient; showDays?: boolean }) => {
    const isSelected = selectedIngredientId === ing.id;
    const gradientClass = categoryColors[ing.category] || categoryColors.Other;
    const days = ing.expiryDate ? getDaysUntilExpiry(ing.expiryDate) : null;
    return (
      <button
        onClick={() => {
          if (isSelected) { setSelectedIngredientId(null); }
          else { setSelectedIngredientId(ing.id); setShowMainIngredientPopup(false); setPopupSearch(""); }
        }}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150",
          "bg-gradient-to-br",
          isSelected
            ? "ring-2 ring-primary border-primary/50 from-primary/20 to-primary/10 text-primary"
            : `${gradientClass} hover:shadow-soft hover:scale-[1.02] text-foreground`
        )}
      >
        {isSelected && <Check className="h-3 w-3 flex-shrink-0" />}
        {ing.name}
        {showDays && days !== null && (
          <span className={cn(
            "px-1.5 py-0.5 rounded-full text-[10px] font-semibold ml-0.5",
            days <= 1 ? "bg-destructive/20 text-destructive" :
            days <= 3 ? "bg-orange-500/20 text-orange-600" :
            "bg-muted text-muted-foreground"
          )}>
            {days <= 0 ? "today" : `${days}d`}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="max-w-3xl mx-auto">

      {/* Pantry Check Popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" onMouseDown={() => setShowPopup(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative w-[92vw] max-w-lg rounded-2xl border border-border bg-card shadow-elevated overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-secondary/40 to-accent/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-serif text-lg font-semibold text-foreground">Pantry Check</p>
                  <p className="text-sm text-muted-foreground">{recipeName}</p>
                </div>
                <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setShowPopup(false)}>Close</Button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-4 w-4 text-primary" />
                  <p className="font-medium text-foreground">In stock</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inStock.map((item, idx) => (
                    <span key={`${item.name}-${idx}`} className="text-xs px-2.5 py-1 rounded-full bg-secondary/60 border border-border">
                      {item.name}{item.amount ? ` • ${item.amount}` : ""}
                    </span>
                  ))}
                </div>
                {inStock.length === 0 && <p className="text-sm text-muted-foreground">No in-stock items returned.</p>}
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-accent-foreground" />
                  <p className="font-medium text-foreground">Need to buy</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {needToBuy.map((item) => (
                    <span key={item.name} className="text-xs px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/30 text-foreground">
                      {item.name}{item.amount ? ` • ${item.amount}` : ""}
                    </span>
                  ))}
                </div>
                {needToBuy.length === 0 && <p className="text-sm text-muted-foreground">You have everything 🎉</p>}
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <Button type="button" variant="hero" className="rounded-xl" onClick={() => { setShowPopup(false); navigate(`/recipe/${popupSessionId}`); }}>
                  Continue
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── REDESIGNED Main Ingredient Popup ── */}
      <AnimatePresence>
        {showMainIngredientPopup && (
          <div className="fixed inset-0 z-40 flex items-center justify-center" onMouseDown={() => { setShowMainIngredientPopup(false); setPopupSearch(""); }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative w-[92vw] max-w-lg bg-card border border-border rounded-2xl shadow-elevated overflow-hidden flex flex-col max-h-[82vh]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-border bg-gradient-to-r from-secondary/40 to-accent/10 flex-shrink-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-lg font-semibold text-foreground">Choose Main Ingredient</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedIngredient
                        ? <>Focusing on <span className="text-primary font-semibold">{selectedIngredient.name}</span> · tap again to deselect</>
                        : "Optional — the recipe will revolve around this ingredient"}
                    </p>
                  </div>
                  <Button type="button" variant="hero" size="sm" className="rounded-xl flex-shrink-0 mt-0.5"
                    onClick={() => { setShowMainIngredientPopup(false); setPopupSearch(""); }}>
                    Done
                  </Button>
                </div>

                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search all ingredients…"
                    value={popupSearch}
                    onChange={(e) => setPopupSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-border bg-background/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {popupSearch && (
                    <button onClick={() => setPopupSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Active diet pill + clear selection */}
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedDietary && excludedCategories.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 border border-accent/25 text-[11px] text-muted-foreground">
                      <Leaf className="h-3 w-3 text-accent-foreground" />
                      <span className="font-medium text-foreground">{selectedDietary}</span>
                      <span>· {excludedCategories.join(" & ")} hidden</span>
                    </div>
                  )}
                  {selectedIngredient && (
                    <button onClick={() => setSelectedIngredientId(null)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-[11px] text-muted-foreground hover:bg-secondary/40 transition-colors">
                      <X className="h-3 w-3" /> Clear selection
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 p-3 space-y-2">

                {/* Search results mode */}
                {searchedIngredients !== null ? (
                  <div>
                    {searchedIngredients.length > 0 ? (
                      <div className="flex flex-wrap gap-2 p-1">
                        {searchedIngredients.map((ing) => (
                          <IngredientChip key={ing.id} ing={ing} showDays />
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-10 text-sm text-muted-foreground">No ingredients match "{popupSearch}"</p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Near Expiry accordion */}
                    {nearExpiryIngredients.length > 0 && (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <button
                          onClick={() => toggleCategory("__near_expiry__")}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                            "bg-destructive/5 hover:bg-destructive/8",
                            expandedCategories.has("__near_expiry__") && "border-b border-border"
                          )}
                        >
                          <Clock className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                          <span className="text-sm font-semibold text-foreground flex-1">Near Expiry</span>
                          {nearExpiryIngredients.some(i => i.id === selectedIngredientId) && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mr-1">selected</span>
                          )}
                          <span className="text-xs text-muted-foreground mr-1">{nearExpiryIngredients.length}</span>
                          <motion.span animate={{ rotate: expandedCategories.has("__near_expiry__") ? 90 : 0 }} transition={{ duration: 0.15 }} className="flex-shrink-0">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </motion.span>
                        </button>
                        <AnimatePresence initial={false}>
                          {expandedCategories.has("__near_expiry__") && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                              <div className="p-3 flex flex-wrap gap-2">
                                {nearExpiryIngredients.map((ing) => <IngredientChip key={ing.id} ing={ing} showDays />)}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Category accordions */}
                    {Object.entries(ingredientsByCategory).map(([category, items]) => {
                      const isOpen = expandedCategories.has(category);
                      const dot = categoryDotColors[category] || categoryDotColors.Other;
                      const headerHover = categoryHeaderBg[category] || "";
                      const hasSelected = items.some((i) => i.id === selectedIngredientId);
                      return (
                        <div key={category} className="rounded-xl border border-border overflow-hidden">
                          <button
                            onClick={() => toggleCategory(category)}
                            className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors bg-secondary/20", headerHover, isOpen && "border-b border-border")}
                          >
                            <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", dot)} />
                            <span className="text-sm font-semibold text-foreground flex-1">{category}</span>
                            {hasSelected && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mr-1">selected</span>
                            )}
                            <span className="text-xs text-muted-foreground mr-1">{items.length}</span>
                            <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.15 }} className="flex-shrink-0">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </motion.span>
                          </button>
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                                <div className="p-3 flex flex-wrap gap-2">
                                  {items.map((ing) => <IngredientChip key={ing.id} ing={ing} />)}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}

                    {filteredAllIngredients.length === 0 && (
                      <p className="text-center py-10 text-sm text-muted-foreground">No compatible ingredients found.</p>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hero Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative mb-10 text-center">
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/25 to-accent/25 mb-5 shadow-elevated border border-primary/10"
        >
          <ChefHat className="h-10 w-10 text-primary" />
        </motion.div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-3 leading-tight">
          Recipe <span className="text-primary">Generator</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
          Transform your pantry ingredients into delicious, waste-free meals
        </p>
      </motion.div>

      {/* ── REDESIGNED Pantry Card ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl border border-border shadow-card overflow-hidden mb-8"
      >
        {/* Card header */}
        <div className="bg-gradient-to-r from-secondary/50 to-accent/10 px-6 py-5 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center shadow-soft">
                <Utensils className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  {pantryOptions.find((p) => p.value === selectedPantry)?.label || "My Pantry"}
                </h2>
              </div>
            </div>
            <Select value={selectedPantry} onValueChange={(val) => { setSelectedPantry(val); setSelectedIngredientId(null); }}>
              <SelectTrigger className="w-auto min-w-[160px] h-10 rounded-xl">
                <Users className="h-4 w-4 mr-2" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pantryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-background p-6 space-y-5">

          {/* Selected ingredient display OR call-to-action */}
          {selectedIngredient ? (
            /* Selected state — show the chosen ingredient prominently */
            <div className={cn(
              "flex items-center justify-between gap-4 p-4 rounded-xl border",
              "bg-gradient-to-br",
              categoryColors[selectedIngredient.category] || categoryColors.Other
            )}>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-card/60 backdrop-blur-sm flex items-center justify-center shadow-soft flex-shrink-0">
                  <Tag className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Main Ingredient</p>
                  <p className="text-base font-semibold text-foreground">{selectedIngredient.name}</p>
                  <p className={cn("text-xs font-medium", categoryTextColors[selectedIngredient.category] || "text-primary")}>
                    {selectedIngredient.category}
                    {selectedIngredient.expiryDate && (
                      <span className="ml-2 text-muted-foreground">
                        · expires in {getDaysUntilExpiry(selectedIngredient.expiryDate)}d
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="rounded-xl text-xs h-8"
                  onClick={() => setShowMainIngredientPopup(true)}>
                  Change
                </Button>
                <Button variant="ghost" size="sm" className="rounded-xl text-xs h-8 text-muted-foreground"
                  onClick={() => setSelectedIngredientId(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            /* Unselected state — friendly prompt */
            <button
              onClick={() => setShowMainIngredientPopup(true)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/3 transition-all duration-200 group text-left"
            >
              <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                <Tag className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Focus on a specific ingredient</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optional · browse all {filteredAllIngredients.length} ingredients by category
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Preferences */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden h-full">
            <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-secondary/30 to-transparent">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-primary" />
                <h3 className="font-serif text-lg font-semibold text-foreground">Preferences</h3>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Cuisine Style</Label>
                <Select value={selectedCuisine} onValueChange={setSelectedCuisine}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cuisines.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedCuisine === "other" && (
                  <Input placeholder="Enter cuisine type..." value={customCuisine} onChange={(e) => setCustomCuisine(e.target.value)} className="h-12 rounded-xl mt-2" />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Meal Type</Label>
                <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mealTypes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden h-full">
            <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-accent/20 to-transparent">
              <div className="flex items-center gap-3">
                <Leaf className="h-5 w-5 text-accent-foreground" />
                <h3 className="font-serif text-lg font-semibold text-foreground">Dietary Options</h3>
              </div>
            </div>
            <div className="p-6 space-y-2">
              {dietaryOptions.map((option) => {
                const isSelected = selectedDietary === option;
                return (
                  <motion.div key={option} whileTap={{ scale: 0.98 }}
                    className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200",
                      isSelected ? "bg-accent/20 border border-accent/30" : "hover:bg-secondary/50 border border-transparent")}
                    onClick={() => handleDietaryToggle(option)}
                  >
                    <div className={cn("h-5 w-5 rounded border-2 flex items-center justify-center transition-all",
                      isSelected ? "bg-primary border-primary" : "border-muted-foreground/30")}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <Label className="cursor-pointer text-sm font-medium text-foreground">{option}</Label>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Servings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-6">
        <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-honey/15 to-transparent">
            <div className="flex items-center gap-3">
              <UtensilsCrossed className="h-5 w-5 text-honey" />
              <h3 className="font-serif text-lg font-semibold text-foreground">Servings</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4">
              <Slider value={[selectedServings]} onValueChange={(val) => setSelectedServings(val[0])} min={1} max={10} step={1} className="flex-1" />
              <span className="text-2xl font-bold text-primary min-w-[3rem] text-center">{selectedServings}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Generate Button */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-8 relative overflow-hidden rounded-3xl border border-primary/20 shadow-elevated">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-accent/10 to-honey/15" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--accent)/0.15),_transparent_60%)]" />
        <div className="relative p-8 text-center">
          <motion.div
            animate={isGenerating ? { rotate: 360 } : { y: [0, -6, 0] }}
            transition={isGenerating ? { duration: 2, repeat: Infinity, ease: "linear" } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary shadow-elevated mb-4"
          >
            <UtensilsCrossed className="h-8 w-8 text-primary-foreground" />
          </motion.div>
          <p className="text-foreground font-serif text-lg font-semibold mb-1">
            Ready to cook with {filteredAllIngredients.length} ingredients
            {selectedIngredient && <span className="text-primary"> · focusing on {selectedIngredient.name}</span>}
          </p>
          <p className="text-muted-foreground text-sm mb-6">We'll craft the perfect recipe from your pantry</p>
          <Button variant="hero" size="lg" className="w-full max-w-md h-14 text-base rounded-xl shadow-elevated" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Sparkles className="h-5 w-5" /></motion.div>Creating Magic...</>
            ) : (
              <><Sparkles className="h-5 w-5" />Generate Recipe</>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
