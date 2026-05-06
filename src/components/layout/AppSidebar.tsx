import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, LogOut, Package, History, ChefHat, Share2, KeyRound, BookOpen } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import logoImage from "@/assets/logo.png";
import { SharePantryDialog } from "@/components/sidebar/SharePantryDialog";
import { NotificationsPopover } from "@/components/sidebar/NotificationsPopover";
import { ChangePasswordDialog } from "@/components/sidebar/ChangePasswordDialog";
import logo from "@/assets/logo.png";
import { useUser } from "@/contexts/UserContext";
import { useNavigate } from "react-router-dom";

const navItems = [{
  title: "Ingredients",
  url: "/dashboard",
  icon: Package
}, {
  title: "Generate Recipe",
  url: "/generate-recipe",
  icon: ChefHat
}, {
  title: "History",
  url: "/history",
  icon: History
}, {
  title: "Recipe History",
  url: "/recipe-history",
  icon: BookOpen
}];
interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const { user, setUser } = useUser();
  const location = useLocation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear user context
    setUser(null);
    // Remove from localStorage
    localStorage.removeItem("user");
    // Redirect to landing or signin
    navigate("/");
  };


  return <>
    {/* Mobile overlay */}
    <AnimatePresence>
      {isOpen && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden" onClick={onToggle} />}
    </AnimatePresence>

    {/* Sidebar */}
    <motion.aside initial={false} animate={{
      width: isOpen ? 280 : 72,
      x: 0
    }} className={cn("fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border z-50", "flex flex-col transition-shadow duration-200", isOpen ? "shadow-elevated" : "shadow-soft")}>
      {/* Toggle button */}
      <Button variant="ghost" size="icon" onClick={onToggle} className="absolute -right-3 top-6 h-6 w-6 rounded-full border border-border bg-primary shadow-soft transition-opacity hover:bg-warm-gray">
        {isOpen ? <ChevronLeft className="h-3 w-3 text-white" /> : <ChevronRight className="h-3 w-3 text-white" />}
      </Button>

      {/* Header */}
      <div
  className="p-4 flex items-center gap-3 cursor-pointer group"
  onClick={() => navigate("/")} // redirect to home
>
  <img
    alt="Zero-Waste Kitchen Logo"
    className="h-10 w-10 rounded-lg object-contain flex-shrink-0 group-hover:scale-105 transition-transform duration-200"
    src={logo}
  />
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        className="overflow-hidden"
      >
        <h1 className="font-serif font-semibold text-foreground text-lg">
          Zero-Waste Kitchen
        </h1>
      </motion.div>
    )}
  </AnimatePresence>
</div>

      <Separator className="mx-4 w-auto" />

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => {
          const isActive = location.pathname === item.url;
          return <NavLink key={item.title} to={item.url} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200", "hover:bg-sidebar-accent group", isActive ? "bg-primary text-primary-foreground shadow-soft" : "text-sidebar-foreground")}>
            <item.icon className={cn("h-5 w-5 flex-shrink-0 transition-transform duration-200", "group-hover:scale-110")} />
            <AnimatePresence>
              {isOpen && <motion.span initial={{
                opacity: 0,
                x: -10
              }} animate={{
                opacity: 1,
                x: 0
              }} exit={{
                opacity: 0,
                x: -10
              }} className="font-medium">
                {item.title}
              </motion.span>}
            </AnimatePresence>
          </NavLink>;
        })}

        <Separator className="my-3" />

        {/* Share Pantry Button */}
        <Button variant="ghost" onClick={() => setIsShareDialogOpen(true)} className={cn("flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all duration-200", "hover:bg-sidebar-accent text-sidebar-foreground justify-start")}>
          <Share2 className="h-5 w-5 flex-shrink-0" />
          <AnimatePresence>
            {isOpen && <motion.span initial={{
              opacity: 0,
              x: -10
            }} animate={{
              opacity: 1,
              x: 0
            }} exit={{
              opacity: 0,
              x: -10
            }} className="font-medium">
              Share Pantry
            </motion.span>}
          </AnimatePresence>
        </Button>

        {/* Notifications */}
        <NotificationsPopover isCollapsed={!isOpen} />
      </nav>

      <Separator className="mx-4 w-auto" />

      {/* User section */}
      <div className="p-3">
        <div className={cn("flex items-center gap-3 p-3 rounded-lg bg-sidebar-accent/50", !isOpen && "justify-center")}>
          <Avatar className="h-9 w-9 border-2 border-primary/20">
            {/* No AvatarImage */}
            <AvatarFallback className="bg-primary text-primary-foreground flex items-center justify-center">
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <AnimatePresence>
            {isOpen && <motion.div initial={{
              opacity: 0,
              x: -10
            }} animate={{
              opacity: 1,
              x: 0
            }} exit={{
              opacity: 0,
              x: -10
            }} className="flex-1 overflow-hidden">
              <p className="font-medium text-sm text-foreground truncate">
                {user?.username || "Guest"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || "guest@example.com"}
              </p>
            </motion.div>}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isOpen && <motion.div initial={{
            opacity: 0,
            height: 0
          }} animate={{
            opacity: 1,
            height: "auto"
          }} exit={{
            opacity: 0,
            height: 0
          }} className="mt-2">
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground" onClick={() => setIsPasswordDialogOpen(true)}>
              <KeyRound className="h-4 w-4" />
              Change Password
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </motion.div>}
        </AnimatePresence>
      </div>
    </motion.aside>

    {/* Dialogs */}
    <SharePantryDialog isOpen={isShareDialogOpen} onClose={() => setIsShareDialogOpen(false)} />
    <ChangePasswordDialog isOpen={isPasswordDialogOpen} onClose={() => setIsPasswordDialogOpen(false)} />
  </>;
}