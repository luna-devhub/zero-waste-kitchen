import { motion } from "framer-motion";
import {
  Edit2,
  Trash2,
  Carrot,
  Apple,
  Milk,
  Drumstick,
  Wheat,
  Flame,
  MoreVertical,
  Box,
  LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface Ingredient {
  id: string; // unique ID (UUID)
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiryDate?: string | null; // optional
  notes?: string;
}

interface IngredientCardProps {
  ingredient: Ingredient;
  onEdit: (ingredient: Ingredient) => void;
  onDelete: (id: string) => void;
  index: number;
  isEditable?: boolean;
}

const categoryColors: Record<string, string> = {
  Vegetables: "bg-sage/50 text-olive",
  Fruits: "bg-honey/30 text-olive",
  Dairy: "bg-cream text-olive",
  Meat: "bg-terracotta/30 text-olive",
  Grains: "bg-secondary text-secondary-foreground",
  Spices: "bg-primary/10 text-primary",
  Other: "bg-muted text-muted-foreground",
};

const categoryIcons: Record<string, LucideIcon> = {
  Vegetables: Carrot,
  Fruits: Apple,
  Dairy: Milk,
  Meat: Drumstick,
  Grains: Wheat,
  Spices: Flame,
  Other: Box,
};

export function IngredientCard({
  ingredient,
  onEdit,
  onDelete,
  index,
  isEditable = true,
}: IngredientCardProps) {
  // Normalize expiry date
  const normalizedExpiry =
    ingredient.expiryDate && ingredient.expiryDate.trim() !== ""
      ? ingredient.expiryDate
      : null;

  const isLowStock = ingredient.quantity <= 2;

  const isExpiringSoon =
    normalizedExpiry &&
    new Date(normalizedExpiry).getTime() <=
      new Date().getTime() + 3 * 24 * 60 * 60 * 1000;

  const CategoryIcon =
    categoryIcons[ingredient.category] || categoryIcons["Other"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "group relative bg-card rounded-xl p-4 border border-border",
        "shadow-soft hover:shadow-card transition-all duration-300",
        "hover:border-primary/30 overflow-hidden"
      )}
    >
      {/* Low stock indicator */}
      {isLowStock && (
        <div className="absolute top-2 right-2 z-10">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-honey opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-honey" />
          </span>
        </div>
      )}

      <div className="flex items-start gap-3 min-w-0">
        {/* Category Icon */}
        <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <CategoryIcon className="h-5 w-5 text-primary" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex flex-col gap-1 mb-1">
            <h3 className="font-serif font-semibold text-foreground truncate pr-8">
              {ingredient.name}
            </h3>

            <Badge
              variant="secondary"
              className={cn(
                "text-xs font-normal w-fit max-w-full truncate",
                categoryColors[ingredient.category] ||
                  categoryColors["Other"]
              )}
            >
              {ingredient.category}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground truncate">
            {ingredient.quantity} {ingredient.unit}
            {isLowStock && (
              <span className="ml-2 text-honey text-xs font-medium">
                • Low stock
              </span>
            )}
          </p>

          {/* Expiry Section */}
          {normalizedExpiry ? (
            <p
              className={cn(
                "text-xs mt-1 truncate",
                isExpiringSoon
                  ? "text-destructive font-medium"
                  : "text-muted-foreground"
              )}
            >
              Expires:{" "}
              {new Date(normalizedExpiry).toLocaleDateString()}
              {isExpiringSoon && " ⚠️"}
            </p>
          ) : (
            <p className="text-xs mt-1 text-muted-foreground italic">
              No expiry date
            </p>
          )}

          {ingredient.notes && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {ingredient.notes}
            </p>
          )}
        </div>

        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem
              onClick={() => isEditable && onEdit(ingredient)}
              disabled={!isEditable}
              className={cn(
                "cursor-pointer",
                !isEditable && "opacity-50 cursor-not-allowed"
              )}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => isEditable && onDelete(ingredient.id)}
              disabled={!isEditable}
              className={cn(
                "cursor-pointer text-destructive focus:text-destructive",
                !isEditable &&
                  "opacity-50 cursor-not-allowed text-muted-foreground"
              )}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
