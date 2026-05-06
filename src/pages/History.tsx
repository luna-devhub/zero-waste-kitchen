import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Search, Filter, ArrowUpRight, ArrowDownRight, Package, Trash2, Edit2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  ingredientName: string;
  action: "added" | "updated" | "deleted" | "used";
  quantity?: number;
  unit?: string;
  timestamp: string; // better to store as ISO string from backend
  details?: string;
}

const actionConfig = {
  added: { icon: Plus, color: "bg-sage/50 text-olive", label: "Added" },
  updated: { icon: Edit2, color: "bg-secondary text-secondary-foreground", label: "Updated" },
  deleted: { icon: Trash2, color: "bg-destructive/10 text-destructive", label: "Deleted" },
  used: { icon: ArrowDownRight, color: "bg-honey/30 text-olive", label: "Used" },
};

export default function History() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const MM_TZ = "Asia/Yangon";
  const toDateSafe = (s?: string) => {
  if (!s) return new Date();
  const hasTZ = /[zZ]|[+-]\d\d:\d\d$/.test(s);
  return new Date(hasTZ ? s : `${s}Z`); // ✅ treat timezone-less string as UTC
};

  // Fetch history from backend
  useEffect(() => {
  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true);

      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const res = await api.get(`/history/user/${user.id}`);

      setHistory(res.data);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  fetchHistory();
}, []);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      const matchesSearch = entry.ingredientName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAction = actionFilter === "all" || entry.action === actionFilter;
      return matchesSearch && matchesAction;
    });
  }, [history, searchQuery, actionFilter]);

  const groupedHistory = useMemo(() => {
  const groups: Record<string, HistoryEntry[]> = {};
  filteredHistory.forEach((entry) => {
    const date = toDateSafe(entry.timestamp);
    const dateKey = date.toLocaleDateString("en-US", {
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

    const thisWeek = history.filter((e) => toDateSafe(e.timestamp) >= weekAgo);

    return {
      added: thisWeek.filter((e) => e.action === "added").length,
      used: thisWeek.filter((e) => e.action === "used").length,
      updated: thisWeek.filter((e) => e.action === "updated").length,
    };
  }, [history]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2"
        >
          Ingredient History
        </motion.h1>
        <p className="text-muted-foreground">
          Track all changes and usage of your ingredients over time.
        </p>
      </div>

      {/* Weekly Stats Pills */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-wrap gap-3 mb-6"
      >
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">This week:</span>
          <div className="flex flex-wrap gap-3">
            {/* Added Pill */}
            <div className="flex items-center gap-2 bg-sage/50 backdrop-blur-sm rounded-full px-4 py-1.5 border border-sage-dark/40 shadow-soft">
              <ArrowUpRight className="h-4 w-4 text-sage-dark" />
              <span className="text-xs font-medium text-olive uppercase tracking-wider">Added</span>
              <span className="text-sm font-bold text-olive">{stats.added}</span>
            </div>

            {/* Used Pill */}
            <div className="flex items-center gap-2 bg-honey/5 backdrop-blur-sm rounded-full px-4 py-1.5 border border-honey/60 shadow-soft">
              <ArrowDownRight className="h-4 w-4 text-honey" />
              <span className="text-xs font-medium text-honey uppercase tracking-wider">Used</span>
              <span className="text-sm font-bold text-honey">{stats.used}</span>
            </div>

            {/* Updated Pill */}
            <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm rounded-full px-4 py-1.5 border border-border shadow-soft">
              <Edit2 className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Updated</span>
              <span className="text-sm font-bold text-foreground">{stats.updated}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-4 mb-6"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="added">Added</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* History Timeline */}
      <div className="space-y-8">
      {isLoadingHistory ? (
          <div className="text-center py-16">
            <div className="animate-spin h-10 w-10 border-4 border-honey/30 border-t-honey rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading history...</p>
          </div>
        ) : Object.entries(groupedHistory).length > 0 ? (
          Object.entries(groupedHistory).map(([date, entries], groupIndex) => (
            <motion.div
              key={date}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-serif text-lg font-semibold text-foreground">{date}</h2>
              </div>

              <div className="space-y-3 ml-4 border-l-2 border-border pl-6">
                {entries.map((entry, index) => {
                  const config = actionConfig[entry.action];
                  const Icon = config.icon;

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="relative"
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-[29px] top-3 h-3 w-3 rounded-full bg-border border-2 border-background" />

                      <div className="bg-card rounded-xl p-4 border border-border shadow-soft hover:shadow-card transition-all duration-200">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-serif font-semibold text-foreground">
                                  {entry.ingredientName}
                                </span>
                                <Badge variant="secondary" className={cn("text-xs", config.color)}>
                                  {config.label}
                                </Badge>
                              </div>
                              {entry.quantity && (
                                <p className="text-sm text-muted-foreground">
                                  {entry.quantity} {entry.unit}
                                </p>
                              )}
                              {entry.details && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {entry.details}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
  {toDateSafe(entry.timestamp).toLocaleTimeString("en-US", {
    timeZone: MM_TZ,
    hour: "numeric",
    minute: "2-digit",
  })}
</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
              No history found
            </h3>
            <p className="text-muted-foreground">
              {searchQuery || actionFilter !== "all"
                ? "Try adjusting your filters"
                : "Start adding ingredients to see your history"}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}