import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ingredient } from "./IngredientCard";

interface IngredientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (ingredient: Omit<Ingredient, "id"> | Ingredient) => void;
  ingredient?: Ingredient | null;
}

const categories = ["Vegetables", "Fruits", "Dairy", "Meat", "Grains", "Spices", "Other"];
const units = ["g", "kg", "ml", "L", "pcs", "cups", "tbsp", "tsp", "oz", "lb"];

export function IngredientModal({ isOpen, onClose, onSave, ingredient }: IngredientModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    quantity: 1,
    unit: "pcs",
    category: "Other",
    expiryDate: "",
    notes: "",
  });

  // ✅ UI-only: keep quantity input as a string so the user can clear it (no forced "0")
  const [quantityInput, setQuantityInput] = useState<string>("1");

  useEffect(() => {
    if (ingredient) {
      setFormData({
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category,
        expiryDate: ingredient.expiryDate || "",
        notes: ingredient.notes || "",
      });
      setQuantityInput(String(ingredient.quantity ?? ""));
    } else {
      setFormData({
        name: "",
        quantity: 1,
        unit: "pcs",
        category: "Other",
        expiryDate: "",
        notes: "",
      });
      // start empty for "Add" so it doesn't show a stubborn 0
      setQuantityInput("");
    }
  }, [ingredient, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Convert only on submit so backend still receives a number
    const quantity = quantityInput.trim() === "" ? 0 : Number(quantityInput);

    const payload = { ...formData, quantity };

    if (ingredient) {
      onSave({ ...payload, id: ingredient.id });
    } else {
      onSave(payload);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="bg-card rounded-2xl shadow-elevated border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-semibold text-foreground">
                  {ingredient ? "Edit Ingredient" : "Add Ingredient"}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Tomatoes"
                    className="mt-1.5"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      step="0.1"
                      value={quantityInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQuantityInput(v);

                        // keep numeric quantity updated when there is a value,
                        // but DON'T force 0 when the input is empty
                        setFormData((prev) => ({
                          ...prev,
                          quantity: v.trim() === "" ? prev.quantity : Number(v),
                        }));
                      }}
                      className="mt-1.5"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="unit">Unit</Label>
                    <Select
                      value={formData.unit}
                      onValueChange={(value) =>
                        setFormData({ ...formData, unit: value })
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="expiryDate">Expiry Date (optional)</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) =>
                      setFormData({ ...formData, expiryDate: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Any additional notes..."
                    className="mt-1.5 resize-none"
                    rows={2}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="hero" className="flex-1">
                    {ingredient ? "Save Changes" : "Add Ingredient"}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}