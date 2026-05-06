import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Calendar, Search, Filter, Clock, Users, ChefHat, BookOpen, Sparkles, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { recipeApi } from "@/lib/api";

interface RecipeHistoryEntry {
  id: string; // session_id
  recipeName: string;
  servings: number;
  cookingTime: number;
  prepTime: number;
  calories: number;
  timestamp: Date;
  ingredientsUsed: string[];
}

type SessionDoc = {
  session_id: string;
  created_at?: string;       // ISO
  confirmed_at?: string;     // ISO
  current_recipe?: any;
};

export default function RecipeHistory() {
  const navigate = useNavigate();
  const MM_TZ = "Asia/Yangon";
  const toDateSafe = (s?: string) => {
  if (!s) return new Date();
  const hasTZ = /[zZ]|[+-]\d\d:\d\d$/.test(s);
  return new Date(hasTZ ? s : `${s}Z`); // ✅ treat timezone-less string as UTC
};
  const userId = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u?.id ?? "";
    } catch {
      return "";
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<RecipeHistoryEntry[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"all" | "favorites">("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set()); // session_id favorites

  useEffect(() => {
    if (!userId) navigate("/signin");
  }, [userId, navigate]);

  const toggleFavorite = (sessionId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  // Load confirmed recipe sessions from backend
  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const docs: SessionDoc[] = await recipeApi.listGenerated({
          user_id: userId,
          only_confirmed: true,
          limit: 100,
        });

        const mapped: RecipeHistoryEntry[] = (docs || []).map((d) => {
          const r = d.current_recipe ?? {};
          const tsStr = d.confirmed_at || d.created_at || new Date().toISOString();
           const ts = toDateSafe(tsStr);

          return {
            id: d.session_id,
            recipeName: r.title ?? "Untitled Recipe",
            servings: Number(r.servings ?? 0) || 0, // if you store servings in recipe
            cookingTime: Number(r.cookingTime ?? r.cooking_time ?? 0) || 0,
            prepTime: Number(r.prepTime ?? r.prep_time ?? 0) || 0,
            calories: Number(r.calories ?? 0) || 0,
            timestamp: ts,
            ingredientsUsed: Array.isArray(r.ingredients)
              ? r.ingredients.map((x: any) => String(x.name ?? "")).filter(Boolean)
              : [],
          };
        });

        setHistory(mapped);
      } catch (e) {
        console.error("Failed to load recipe history:", e);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  const filteredHistory = useMemo(() => {
    let filtered = history;

    // tab filter
    if (activeTab === "favorites") {
      filtered = filtered.filter((entry) => favorites.has(entry.id));
    }

    // search filter
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((entry) => entry.recipeName.toLowerCase().includes(q));
    }

    // time filter
    const now = new Date();
    const mmDateKey = (dt: Date) =>
  dt.toLocaleDateString("en-CA", { timeZone: MM_TZ }); // YYYY-MM-DD

const todayKey = mmDateKey(new Date());
const yesterdayKey = mmDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const monthAgo = new Date(new Date().setMonth(new Date().getMonth() - 1));

filtered = filtered.filter((entry) => {
  const k = mmDateKey(entry.timestamp);
  if (timeFilter === "all") return true;
  if (timeFilter === "today") return k === todayKey;
  if (timeFilter === "yesterday") return k === yesterdayKey;
  if (timeFilter === "week") return entry.timestamp >= weekAgo;   // OK for “last 7 days”
  if (timeFilter === "month") return entry.timestamp >= monthAgo; // OK for “last 30-ish days”
  return true;
});

    // sort newest first
    filtered = [...filtered].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return filtered;
  }, [history, searchQuery, timeFilter, activeTab, favorites]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, RecipeHistoryEntry[]> = {};
    filteredHistory.forEach((entry) => {
      const dateKey = entry.timestamp.toLocaleDateString("en-US", {
  timeZone: MM_TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
});
      (groups[dateKey] ||= []).push(entry);
    });
    return groups;
  }, [filteredHistory]);

  const stats = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = history.filter((e) => e.timestamp >= weekAgo);
    return { generated: thisWeek.length, total: history.length };
  }, [history]);

  const handleViewRecipe = (sessionId: string) => {
    // open session-based recipe page
    navigate(`/recipe/${sessionId}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
          Recipe History
        </motion.h1>
        <p className="text-muted-foreground">
          Browse and revisit all your confirmed recipes.
        </p>
      </div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex gap-2 mb-6">
        <Button
          variant={activeTab === "all" ? "default" : "ghost"}
          onClick={() => setActiveTab("all")}
          className={cn("rounded-full px-6", activeTab === "all" && "bg-primary text-primary-foreground shadow-soft")}
        >
          All Recipes
        </Button>
        <Button
          variant={activeTab === "favorites" ? "default" : "ghost"}
          onClick={() => setActiveTab("favorites")}
          className={cn("rounded-full px-6", activeTab === "favorites" && "bg-primary text-primary-foreground shadow-soft")}
        >
          ⭐ Favorites
        </Button>
      </motion.div>

      {/* Weekly Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">This week:</span>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-primary/10 backdrop-blur-sm rounded-full px-4 py-1.5 border border-primary/30 shadow-soft">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">Total</span>
              <span className="text-sm font-bold text-primary">{stats.generated}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Loading state */}
      {loading && (
        <div className="col-span-full text-center py-16">
                <div className="animate-spin h-10 w-10 border-4 border-honey/30 border-t-honey rounded-full mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading recipe history...</p>
              </div>
      )}

      {/* Timeline */}
      {!loading && (
        <div className="space-y-8">
          {Object.entries(groupedHistory).length > 0 ? (
            Object.entries(groupedHistory).map(([date, entries], groupIndex) => (
              <motion.div key={date} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIndex * 0.1 }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="font-serif text-lg font-semibold text-foreground">{date}</h2>
                </div>

                <div className="space-y-3 ml-4 border-l-2 border-border pl-6">
                  {entries.map((entry, index) => (
                    <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }} className="relative">
                      <div className="absolute -left-[29px] top-3 h-3 w-3 rounded-full bg-border border-2 border-background" />

                      <div className="bg-card rounded-xl p-4 border border-border shadow-soft hover:shadow-card transition-all duration-200 group relative">
                        <div className="cursor-pointer" onClick={() => handleViewRecipe(entry.id)}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                                <ChefHat className="h-6 w-6 text-primary" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h3 className="font-serif font-semibold text-foreground group-hover:text-primary transition-colors">
                                    {entry.recipeName}
                                  </h3>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {entry.timestamp.toLocaleTimeString("en-US", {
  timeZone: MM_TZ,
  hour: "numeric",
  minute: "2-digit",
})}
                                  </span>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-3">
                                  <Badge variant="secondary" className="bg-gradient-to-r from-primary/10 to-primary/5 text-primary border-primary/20">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {entry.cookingTime + entry.prepTime}m
                                  </Badge>
                                  <Badge variant="secondary" className="bg-gradient-to-r from-honey/20 to-honey/10 text-foreground border-honey/30">
                                    <Users className="h-3 w-3 mr-1" />
                                    {entry.servings || "—"} servings
                                  </Badge>
                                  <Badge variant="secondary" className="bg-gradient-to-r from-accent/10 to-accent/5 text-accent-foreground border-accent/20">
                                    {entry.calories || "—"} cal
                                  </Badge>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex flex-wrap gap-1 flex-1">
                                    {entry.ingredientsUsed.slice(0, 3).map((ingredient, idx) => (
                                      <span key={idx} className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-md">
                                        {ingredient}
                                      </span>
                                    ))}
                                    {entry.ingredientsUsed.length > 3 && (
                                      <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-md">
                                        +{entry.ingredientsUsed.length - 3} more
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(entry.id);
                                    }}
                                    className={cn(
                                      "h-8 w-8 rounded-full flex items-center justify-center transition-all flex-shrink-0",
                                      favorites.has(entry.id)
                                        ? "bg-honey/20 text-honey hover:bg-honey/30"
                                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-honey"
                                    )}
                                  >
                                    <Star className={cn("h-4 w-4 transition-all", favorites.has(entry.id) && "fill-honey")} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                No recipes found
              </h3>
              <p className="text-muted-foreground mb-6">
                {activeTab === "favorites"
                  ? "You haven't favorited any recipes yet"
                  : searchQuery || timeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Confirm recipes to see your history"}
              </p>
              <Button variant="hero" onClick={() => navigate("/generate-recipe")}>
                <Sparkles className="h-4 w-4" />
                Start Cooking Something New
              </Button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}