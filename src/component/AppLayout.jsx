import React, { useState } from "react";
import { Link, useLocation, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/theme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    LayoutDashboard, MessageSquare, ListChecks, Network, BookOpen,
    Compass, HelpCircle, StickyNote, BarChart3, Trophy, User, Settings,
    Moon, Sun, LogOut, Sparkles, Languages, ChevronDown, Menu, X,
    GraduationCap, Heart, Building2, RotateCcw, Bell, Eye
} from "lucide-react";
import { INDIAN_LANGUAGES } from "@/lib/skillsGraph";
import NotificationBell from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { useFocusMode } from "@/lib/focusMode";

const STUDENT_NAV = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { label: "AI Tutor", icon: MessageSquare, path: "/ai-tutor" },
    { label: "Learning Plan", icon: ListChecks, path: "/learning-plan" },
    { label: "My Courses", icon: BookOpen, path: "/courses" },
    { label: "Discover", icon: Compass, path: "/discover" },
    { label: "My Notes", icon: StickyNote, path: "/notes" },
    { label: "Review", icon: RotateCcw, path: "/review" },
    { label: "Progress", icon: BarChart3, path: "/progress" },
];

const TEACHER_NAV = [
    { label: "Teacher Dashboard", icon: GraduationCap, path: "/teacher" },
    { label: "Progress", icon: BarChart3, path: "/progress" },
    { label: "Account", icon: User, path: "/account" },
];

const PARENT_NAV = [
    { label: "Parent Portal", icon: Heart, path: "/parent" },
    { label: "Notifications", icon: Bell, path: "/notifications" },
    { label: "Account", icon: User, path: "/account" },
];

const INSTITUTION_NAV = [
    { label: "Institution Console", icon: Building2, path: "/institution" },
    { label: "Notifications", icon: Bell, path: "/notifications" },
    { label: "Account", icon: User, path: "/account" },
];

const COMMON_NAV = [
    { label: "Notifications", icon: Bell, path: "/notifications" },
    { label: "Account", icon: User, path: "/account" },
];

export default function AppLayout() {
    const location = useLocation();
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const focusMode = useFocusMode();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewRole, setPreviewRole] = useState(
        localStorage.getItem("kyren-preview-role") || ""
    );
    const [selectedLang, setSelectedLang] = useState(
        localStorage.getItem("kyren-language") || "en"
    );

    const realRole = user?.role || "user";
    const effectiveRole = previewRole || realRole;
    const isAdmin = realRole === "admin";

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

    const getNavItems = () => {
        if (effectiveRole === "teacher") return TEACHER_NAV;
        if (effectiveRole === "parent") return PARENT_NAV;
        if (effectiveRole === "institution_admin") return INSTITUTION_NAV;
        if (isAdmin) return [...STUDENT_NAV, { label: "Admin Panel", icon: BarChart3, path: "/admin" }, ...COMMON_NAV];
        return [...STUDENT_NAV, ...COMMON_NAV];
    };
    const NAV_ITEMS = getNavItems();

    const handlePreviewRole = (role) => {
        const val = role === realRole ? "" : role;
        setPreviewRole(val);
        localStorage.setItem("kyren-preview-role", val);
        setPreviewOpen(false);
        if (val === "teacher") window.location.href = "/teacher";
        else if (val === "parent") window.location.href = "/parent";
        else if (val === "institution_admin") window.location.href = "/institution";
        else if (!val) window.location.href = "/dashboard";
    };

    const handleLangChange = (code) => {
        setSelectedLang(code);
        localStorage.setItem("kyren-language", code);
        setLangOpen(false);
    };

    const handleLogout = () => {
        logout(false);
        window.location.href = "/";
    };

    const userName = user?.full_name || user?.email || "Student";
    const initials = userName.charAt(0).toUpperCase();

    if (!user?.onboarding_complete && location.pathname !== "/account" && user?.role !== "admin") {
        return <Navigate to="/onboarding" replace />;
    }

    const SidebarContent = () => (
        <>
            <div className="flex items-center justify-between px-5 py-5">
                <Link to="/dashboard" className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-black flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="sf-display text-lg tracking-tight leading-none text-foreground">KYREN</h1>
                        <span className="sf-label text-text-secondary text-[9px]">
                            {effectiveRole === "teacher" ? "Teacher" :
                                effectiveRole === "parent" ? "Parent" :
                                    effectiveRole === "institution_admin" ? "Institution" :
                                        isAdmin ? "Admin" : "Adaptive OS"}
                        </span>
                    </div>
                </Link>
                <NotificationBell />
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {NAV_ITEMS.map((item, index) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                                "group flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all",
                                active
                                    ? "bg-primary/10 text-primary"
                                    : "text-text-secondary hover:text-foreground hover:bg-muted"
                            )}
                        >
                            <span className="sf-label text-muted-foreground/60 w-5 shrink-0 text-[10px]">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-text-secondary group-hover:text-foreground")} />
                            <span className="truncate">{item.label}</span>
                            {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-3 space-y-2">
                {realRole !== "admin" && (
                    <div className="relative">
                        <button
                            onClick={() => setPreviewOpen(!previewOpen)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-text-secondary hover:text-foreground hover:bg-muted transition"
                        >
                            <Eye className="w-4 h-4 shrink-0" />
                            <span className="flex-1 text-left truncate">{previewRole ? `Previewing: ${previewRole}` : "Preview other roles"}</span>
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        </button>
                        {previewOpen && (
                            <div className="absolute bottom-full mb-2 left-0 right-0 sf-card rounded-2xl z-50 overflow-hidden p-1">
                                {[
                                    { role: "user", label: "Student", icon: GraduationCap },
                                    { role: "teacher", label: "Teacher", icon: GraduationCap },
                                    { role: "parent", label: "Parent", icon: Heart },
                                    { role: "institution_admin", label: "Institution Admin", icon: Building2 },
                                ].map((opt) => (
                                    <button
                                        key={opt.role}
                                        onClick={() => handlePreviewRole(opt.role)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted rounded-xl transition",
                                            effectiveRole === opt.role && "text-primary"
                                        )}
                                    >
                                        <opt.icon className="w-4 h-4" />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="relative">
                    <button
                        onClick={() => setLangOpen(!langOpen)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-text-secondary hover:text-foreground hover:bg-muted transition"
                    >
                        <Languages className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-left truncate">
                            {INDIAN_LANGUAGES.find((l) => l.code === selectedLang)?.name || "English"}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    </button>
                    {langOpen && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 max-h-52 overflow-y-auto sf-card rounded-2xl z-50 p-1">
                            {INDIAN_LANGUAGES.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => handleLangChange(lang.code)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted rounded-xl transition",
                                        selectedLang === lang.code && "text-primary"
                                    )}
                                >
                                    <span>{lang.name}</span>
                                    <span className="sf-serif text-base">{lang.native}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-text-secondary hover:text-foreground hover:bg-muted transition"
                >
                    {theme === "dark" ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
                    <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                </button>

                <div className="sf-card rounded-full flex items-center gap-2.5 px-3 py-2 mt-2">
                    <Avatar className="w-8 h-8 shrink-0">
                        <AvatarFallback className="bg-brand-black text-primary text-xs font-semibold">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-foreground">{userName}</div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-1.5 rounded-full text-text-secondary hover:text-primary hover:bg-primary/10 transition shrink-0"
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </>
    );

    return (
        <div className="flex h-screen bg-background text-foreground relative overflow-hidden">
            <div className="absolute inset-0 sf-atmosphere pointer-events-none z-0" />
            <div className="absolute top-0 left-1/4 w-[500px] h-[400px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none z-0" />

            {sidebarOpen && !focusMode && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside className={cn("hidden lg:flex flex-col fixed top-5 bottom-5 left-5 w-72 z-30", focusMode && "lg:hidden")}>
                <div className="sf-card rounded-2xl flex flex-col h-full overflow-hidden">
                    <SidebarContent />
                </div>
            </aside>

            <aside
                className={cn(
                    "fixed top-5 bottom-5 left-5 w-72 z-50 transition-transform lg:hidden",
                    sidebarOpen ? "translate-x-0" : "-translate-x-[110%]",
                    focusMode && "hidden"
                )}
            >
                <div className="sf-card rounded-2xl flex flex-col h-full overflow-hidden">
                    <SidebarContent />
                </div>
            </aside>

            <main className={cn("flex-1 overflow-y-auto relative z-10", !focusMode && "lg:ml-80")}>
                <div className={cn("lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 sf-nav rounded-b-2xl", focusMode && "hidden")}>
                    <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-full hover:bg-muted transition">
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-black flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <span className="sf-display text-sm">KYREN</span>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-full hover:bg-muted transition invisible">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <Outlet />
            </main>
        </div>
    );
}