// src/pages/Dashboard.tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Filter, Package, LayoutGrid, List, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IngredientCard, Ingredient } from "@/components/ingredients/IngredientCard";
import { IngredientModal } from "@/components/ingredients/IngredientModal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useUser } from "@/contexts/UserContext";
import { useSharedPantries } from "@/hooks/useSharedPantries";
import { SharedUser } from "@/types/share";
import { toast } from "sonner";

const categories = ["All", "Vegetables", "Fruits", "Dairy", "Meat", "Grains", "Spices", "Other"];

interface ExtendedIngredient extends Ingredient {
  isShared?: boolean;
  sharedBy?: string;
}

const UNIT_TYPE = {
  g: "weight", kg: "weight", oz: "weight", lb: "weight",
  ml: "volume", L: "volume", l: "volume", cups: "volume", tbsp: "volume", tsp: "volume",
  pcs: "count", piece: "count",
};

export default function Dashboard() {
  const [ingredients, setIngredients] = useState<ExtendedIngredient[]>([]);
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(true);
  const [sharedIngredients, setSharedIngredients] = useState<Record<string, ExtendedIngredient[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPantry, setSelectedPantry] = useState<string>("my-pantry");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(false);

  const { user } = useUser();
  const { sharedUsers } = useSharedPantries();

  // FIX 1: Load waste from localStorage synchronously into initial state
  // so it's never set twice (avoids the localStorage effect racing with fetchMyIngredients)
  const [wasteIngredients, setWasteIngredients] = useState<ExtendedIngredient[]>(() => {
    try {
      const stored = localStorage.getItem("wasteIngredients");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [showWasteStats, setShowWasteStats] = useState(false);
  const [wasteType, setWasteType] = useState<"weight" | "volume" | "count">("weight");

  // FIX 2: Track the last userId we fetched for, so we only re-fetch when it
  // actually changes (not on every render where user object reference changes)
  const lastFetchedUserId = useRef<string | null>(null);

  const normalizeWeight = (value: number, unit: string) => {
    switch (unit) {
      case "kg": return value * 1000;
      case "g": return value;
      case "oz": return value * 28.3495;
      case "lb": return value * 453.592;
      default: return value;
    }
  };

  const normalizeVolume = (value: number, unit: string) => {
    switch (unit) {
      case "L": return value * 1000;
      case "ml": return value;
      case "cups": return value * 240;
      case "tbsp": return value * 15;
      case "tsp": return value * 5;
      default: return value;
    }
  };

  const getUserId = () => {
    if (user?.id) return user.id;
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored).id : null;
    } catch {
      return null;
    }
  };

  const fetchMyIngredients = async () => {
    const userId = getUserId();
    if (!userId) return;

    try {
      setIsLoadingIngredients(true);
      const res = await api.get(`/ingredients/user/${userId}`);
      const fetchedIngredients: ExtendedIngredient[] = res.data;

      const expiredIngredients = await deleteExpiredIngredients(fetchedIngredients);
      const activeIngredients = expiredIngredients?.length
        ? fetchedIngredients.filter(i => !expiredIngredients.includes(i))
        : fetchedIngredients;

      setIngredients(activeIngredients);

      if (expiredIngredients && expiredIngredients.length > 0) {
        setWasteIngredients(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const newItems = expiredIngredients.filter(i => !existingIds.has(i.id));
          return newItems.length > 0 ? [...prev, ...newItems] : prev;
        });
      }
    } catch (error) {
      console.error("Error fetching ingredients:", error);
      toast.error("Failed to load your ingredients");
    } finally {
      setIsLoadingIngredients(false);
    }
  };

  // FIX 3: Only fetch when userId genuinely changes (not on every render)
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    if (userId === lastFetchedUserId.current) return; // already fetched for this user
    lastFetchedUserId.current = userId;
    fetchMyIngredients();
  }, [user?.id]);

  // FIX 4: Use a ref to track which shared users we've already fetched,
  // so the effect doesn't re-run when sharedIngredients state updates
  const fetchedSharedIds = useRef<Set<string>>(new Set());

  const fetchSharedUserIngredients = async (sharedUser: SharedUser) => {
    try {
      setIsLoadingShared(true);
      const res = await api.get(`/ingredients/user/${sharedUser.user_id}`);
      const ingredientsWithMeta = res.data.map((ing: Ingredient) => ({
        ...ing,
        isShared: true,
        sharedBy: sharedUser.username,
      }));
      setSharedIngredients(prev => ({
        ...prev,
        [sharedUser.user_id]: ingredientsWithMeta,
      }));
    } catch (error) {
      console.error(`Error fetching ingredients for ${sharedUser.username}:`, error);
      toast.error(`Failed to load ${sharedUser.username}'s ingredients`);
    } finally {
      setIsLoadingShared(false);
    }
  };

  useEffect(() => {
    if (sharedUsers.length === 0) return;
    sharedUsers.forEach(u => {
      // Only fetch if we haven't fetched this user yet in this session
      if (!fetchedSharedIds.current.has(u.user_id)) {
        fetchedSharedIds.current.add(u.user_id);
        fetchSharedUserIngredients(u);
      }
    });
  }, [sharedUsers]);

  // FIX 5: Persist waste to localStorage in a single effect, no separate load effect needed
  // (initial state already loaded from localStorage above)
  useEffect(() => {
    localStorage.setItem("wasteIngredients", JSON.stringify(wasteIngredients));
  }, [wasteIngredients]);

  const displayIngredients = useMemo(() => {
    if (selectedPantry === "my-pantry") return ingredients;
    const sharedUser = sharedUsers.find(u =>
      u.username === selectedPantry || u.user_id === selectedPantry
    );
    if (sharedUser) return sharedIngredients[sharedUser.user_id] || [];
    return [];
  }, [ingredients, sharedIngredients, sharedUsers, selectedPantry]);

  const filteredIngredients = useMemo(() => {
    return displayIngredients.filter((ingredient) => {
      const matchesSearch = ingredient.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || ingredient.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [displayIngredients, searchQuery, selectedCategory]);

  const normalizeDate = (date?: string | null) => {
    if (!date || date.trim() === "") return null;
    return date;
  };

  const handleSave = async (data: Omit<Ingredient, "id"> | Ingredient) => {
    try {
      const userId = getUserId();
      if (!userId) { toast.error("User not found"); return; }

      if ("id" in data) {
        if (data.quantity <= 0) {
          await api.delete(`/ingredients/${data.id}`);
          toast.info(`${data.name} removed (stock is 0)`);
        } else {
          await api.put(`/ingredients/${data.id}`, {
            ...data,
            expiryDate: normalizeDate(data.expiryDate),
            user_id: userId,
          });
          toast.success("Ingredient updated successfully");
        }
      } else {
        const normalizedNewDate = normalizeDate(data.expiryDate);
        const existingBatch = ingredients.find((item) => {
          return (
            item.name.trim().toLowerCase() === data.name.trim().toLowerCase() &&
            normalizeDate(item.expiryDate) === normalizedNewDate
          );
        });

        if (existingBatch) {
          await api.put(`/ingredients/${existingBatch.id}`, {
            ...existingBatch,
            quantity: existingBatch.quantity + data.quantity,
            expiryDate: normalizedNewDate,
            user_id: userId,
          });
          toast.success("Ingredient quantity merged with existing batch");
        } else {
          await api.post("/ingredients", {
            ...data,
            expiryDate: normalizedNewDate,
            user_id: userId,
          });
          toast.success("Ingredient added successfully");
        }
      }

      await fetchMyIngredients();
      setEditingIngredient(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving ingredient:", error);
      toast.error("Failed to save ingredient");
    }
  };

  const handleEdit = (ingredient: Ingredient) => {
    setEditingIngredient(ingredient);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/ingredients/${id}`);
      await fetchMyIngredients();
      toast.success("Ingredient deleted successfully");
    } catch (error) {
      console.error("Error deleting ingredient:", error);
      toast.error("Failed to delete ingredient");
    }
  };

  const deleteExpiredIngredients = async (ingredientsList: ExtendedIngredient[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = ingredientsList.filter(i => i.expiryDate && new Date(i.expiryDate) < today);
    if (expired.length === 0) return [];

    try {
      await Promise.all(expired.map(i => api.delete(`/ingredients/${i.id}`)));
      toast.info(`Expired removed: ${expired.map(i => i.name).join(", ")}`);
    } catch (error) {
      console.error("Error deleting expired ingredients:", error);
      toast.error("Failed to remove some expired ingredients");
    }

    return expired;
  };

  const wasteAnalytics = useMemo(() => {
    const result = {
      weight: {} as Record<string, number>,
      volume: {} as Record<string, number>,
      count: {} as Record<string, number>,
    };

    wasteIngredients.forEach((item) => {
      const unit = (item.unit || "").toLowerCase();
      const unitType = UNIT_TYPE[unit as keyof typeof UNIT_TYPE] || "count";
      const category = item.category || "Other";

      let normalizedValue = item.quantity;
      if (unitType === "weight") normalizedValue = normalizeWeight(item.quantity, item.unit);
      if (unitType === "volume") normalizedValue = normalizeVolume(item.quantity, item.unit);

      result[unitType][category] = (result[unitType][category] || 0) + normalizedValue;
    });

    return result;
  }, [wasteIngredients]);

  const stats = useMemo(() => {
    const total = ingredients.length;
    const lowStock = ingredients.filter((i) => i.quantity <= 2).length;
    const expiringSoon = ingredients.filter((i) => {
      if (!i.expiryDate) return false;
      const expiryDate = new Date(i.expiryDate);
      const today = new Date();
      const threeDaysFromNow = new Date(today.setDate(today.getDate() + 3));
      return expiryDate <= threeDaysFromNow;
    }).length;
    return { total, lowStock, expiringSoon };
  }, [ingredients]);

  const isViewingOwnPantry = selectedPantry === "my-pantry";

  const getSelectedPantryName = () => {
    if (selectedPantry === "my-pantry") return "My Pantry";
    const sharedUser = sharedUsers.find(u =>
      u.username === selectedPantry || u.user_id === selectedPantry
    );
    return sharedUser ? `${sharedUser.username}'s Pantry` : "Shared Pantry";
  };

  const currentSharedUser = isViewingOwnPantry
    ? null
    : sharedUsers.find(u => u.username === selectedPantry || u.user_id === selectedPantry);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2"
        >
          {getSelectedPantryName()}
        </motion.h1>
        <p className="text-muted-foreground">
          {isViewingOwnPantry
            ? "Manage your pantry and keep track of what you have."
            : `Viewing ${currentSharedUser?.username || 'shared'}'s ingredients`}
        </p>
      </div>

      {/* Stats Pills */}
      {isViewingOwnPantry && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-3 mb-6"
        >
          <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm rounded-full px-4 py-1.5 border border-border shadow-soft">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold text-foreground">{stats.total}</span>
          </div>
          <div className="flex items-center gap-2 bg-honey/5 backdrop-blur-sm rounded-full px-4 py-1.5 border border-honey/60 shadow-soft">
            <div className="h-1.5 w-1.5 rounded-full bg-honey animate-pulse" />
            <span className="text-xs font-medium text-honey uppercase tracking-wider">Low Stock</span>
            <span className="text-sm font-bold text-honey">{stats.lowStock}</span>
          </div>
          <div className="flex items-center gap-2 bg-destructive/5 backdrop-blur-sm rounded-full px-4 py-1.5 border border-destructive/20 shadow-soft">
            <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
            <span className="text-xs font-medium text-destructive uppercase tracking-wider">Expiring</span>
            <span className="text-sm font-bold text-destructive">{stats.expiringSoon}</span>
          </div>
        </motion.div>
      )}

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col gap-4 mb-6"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ingredients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {(sharedUsers.length > 0 || isViewingOwnPantry) && (
            <Select value={selectedPantry} onValueChange={setSelectedPantry}>
              <SelectTrigger className="w-auto min-w-[200px] justify-between px-4">
                <Users className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Select Pantry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="my-pantry">
                  <span className="font-medium">My Pantry</span>
                </SelectItem>
                {sharedUsers.map((sharedUser) => (
                  <SelectItem key={sharedUser.user_id} value={sharedUser.username}>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span>{sharedUser.username}'s Pantry</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isViewingOwnPantry && (
            <div className="flex items-center gap-2">
              <Button variant={!showWasteStats ? "default" : "outline"} onClick={() => setShowWasteStats(false)}>
                Ingredients
              </Button>
              <Button variant={showWasteStats ? "default" : "outline"} onClick={() => setShowWasteStats(true)}>
                Waste Statistics
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("grid")} className="rounded-none">
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("list")} className="rounded-none">
                <List className="h-4 w-4" />
              </Button>
            </div>
            {isViewingOwnPantry && (
              <Button variant="hero" onClick={() => setIsModalOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Ingredient</span>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Waste Stats or Ingredient Grid */}
      {showWasteStats ? (
        <div className="">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT — Charts */}
            <div className="space-y-8 p-6">
              <h3 className="text-xl font-semibold">Waste by Category</h3>

              {(["weight", "volume", "count"] as const).map((type) => {
                const labelMap = { weight: "Weight (g)", volume: "Volume (ml)", count: "Count (pcs)" };
                const unitMap = { weight: "g", volume: "ml", count: "pcs" };
                const data = Object.entries(wasteAnalytics[type]).map(([cat, total]) => ({ category: cat, total }));

                return (
                  <div key={type} className="bg-card p-6 border rounded-lg shadow-soft">
                    <h4 className="text-sm font-medium mb-4 text-muted-foreground">{labelMap[type]}</h4>
                    <div style={{ width: "100%", height: 250 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                          <XAxis dataKey="category" />
                          <YAxis />
                          <Tooltip formatter={(value: number) => `${type === "count" ? value : value.toFixed(0)} ${unitMap[type]}`} />
                          <Bar dataKey="total" fill="#7D5F41" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT — Details */}
            <div className="pt-8 space-y-6">
              <h3 className="text-xl font-semibold">Detailed Breakdown</h3>
              {(["weight", "volume", "count"] as const).map((type) => {
                const data = wasteAnalytics[type];
                if (!Object.keys(data).length) return null;
                const unitLabel = type === "weight" ? "g" : type === "volume" ? "ml" : "pcs";

                return (
                  <div key={type} className="space-y-4">
                    {Object.entries(data).map(([cat, total]) => (
                      <div key={cat} className="bg-card border rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-lg font-semibold">{cat}</span>
                          <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-600">
                            {total.toFixed(0)} {unitLabel}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {wasteIngredients
                            .filter(i => (i.category || "Other") === cat)
                            .filter(i => {
                              const unit = (i.unit || "").toLowerCase();
                              return (UNIT_TYPE[unit as keyof typeof UNIT_TYPE] || "count") === type;
                            })
                            // FIX 6: Deduplicate chips by id before rendering
                            .filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx)
                            .map(item => {
                              let normalizedValue = item.quantity;
                              if (type === "weight") normalizedValue = normalizeWeight(item.quantity, item.unit);
                              if (type === "volume") normalizedValue = normalizeVolume(item.quantity, item.unit);
                              return (
                                <div key={item.id} className="px-3 py-1 text-sm rounded-full bg-secondary text-foreground">
                                  {item.name} • {normalizedValue.toFixed(0)} {unitLabel}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            key={selectedPantry}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                : "space-y-3"
            )}
          >
            {(isLoadingShared || isLoadingIngredients) ? (
              <div className="col-span-full text-center py-16">
                <div className="animate-spin h-10 w-10 border-4 border-honey/30 border-t-honey rounded-full mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading ingredients...</p>
              </div>
            ) : filteredIngredients.length > 0 ? (
              filteredIngredients.map((ingredient, index) => (
                <IngredientCard
                  key={`${selectedPantry}-${ingredient.id}`}
                  ingredient={ingredient}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  index={index}
                  isEditable={isViewingOwnPantry}
                />
              ))
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full text-center py-16">
                <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                  <Package className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">No ingredients found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || selectedCategory !== "All" ? "Try adjusting your filters" : "Start adding ingredients to your pantry"}
                </p>
                {isViewingOwnPantry && (
                  <Button variant="hero" onClick={() => setIsModalOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add Your First Ingredient
                  </Button>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <IngredientModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingIngredient(null); }}
        onSave={handleSave}
        ingredient={editingIngredient}
      />
    </div>
  );
}
