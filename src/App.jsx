import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from './component/UserNotRegisteredError';
import ScrollToTop from './component/ScrollToTop';
import { ThemeProvider } from '@/lib/theme';
import { AppDataProvider } from '@/lib/appData';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
// Add page imports here
import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding';
import Dashboard from '@/pages/Dashboard';
import Courses from '@/pages/Courses';
import CourseDetail from '@/pages/CourseDetail';
import LessonDetail from '@/pages/LessonDetail';
import NotesPage from '@/pages/NotesPage';
import Discover from '@/pages/Discover';
import Admin from '@/pages/Admin';
import Confirmation from '@/pages/Confirmation';
import Notifications from '@/pages/Notifications';
import TeacherDashboard from '@/pages/TeacherDashboard';
import ParentPortal from '@/pages/ParentPortal';
import InstitutionConsole from '@/pages/InstitutionConsole';
import Review from '@/pages/Review';
import Login from '@/pages/login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AITutor from '@/pages/AITutor';
import LearningPlan from '@/pages/LearningPlan';
import Progress from '@/pages/Progress';
import Account from '@/pages/Account';

const AuthenticatedApp = () => {
    const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

    if (isLoadingPublicSettings || isLoadingAuth) {
        return (
            <div className="fixed inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (authError) {
        if (authError.type === 'user_not_registered') {
            return <UserNotRegisteredError />;
        } else if (authError.type === 'auth_required') {
            navigateToLogin();
            return null;
        }
    }

    return (
        <AppDataProvider>
            <Routes>
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Protected routes */}
                <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/companion" element={<Navigate to="/ai-tutor?tab=plan" replace />} />
                    <Route path="/doubt-solver" element={<Navigate to="/ai-tutor?tab=ask" replace />} />
                    <Route path="/tasks" element={<Navigate to="/learning-plan?view=list" replace />} />
                    <Route path="/roadmap" element={<Navigate to="/learning-plan?view=roadmap" replace />} />
                    <Route path="/analytics" element={<Navigate to="/progress?tab=analytics" replace />} />
                    <Route path="/achievements" element={<Navigate to="/progress?tab=achievements" replace />} />
                    <Route path="/profile" element={<Navigate to="/account?tab=profile" replace />} />
                    <Route path="/settings" element={<Navigate to="/account?tab=settings" replace />} />
                    <Route path="/path-simulator" element={<Navigate to="/discover?tab=simulator" replace />} />
                    <Route element={<AppLayout />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/ai-tutor" element={<AITutor />} />
                        <Route path="/learning-plan" element={<LearningPlan />} />
                        <Route path="/progress" element={<Progress />} />
                        <Route path="/account" element={<Account />} />
                        <Route path="/confirmation" element={<Confirmation />} />
                        <Route path="/courses" element={<Courses />} />
                        <Route path="/courses/:courseId" element={<CourseDetail />} />
                        <Route path="/courses/:courseId/lessons/:lessonId" element={<LessonDetail />} />
                        <Route path="/notes" element={<NotesPage />} />
                        <Route path="/discover" element={<Discover />} />
                        <Route path="/admin" element={<Admin />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/review" element={<Review />} />
                        <Route path="/teacher" element={<TeacherDashboard />} />
                        <Route path="/parent" element={<ParentPortal />} />
                        <Route path="/institution" element={<InstitutionConsole />} />
                    </Route>
                </Route>

                <Route path="*" element={<PageNotFound />} />
            </Routes>
        </AppDataProvider>
    );
};


function App() {
    return (
        <AuthProvider>
            <QueryClientProvider client={queryClientInstance}>
                <Router>
                    <ScrollToTop />
                    <ThemeProvider>
                        <AuthenticatedApp />
                    </ThemeProvider>
                </Router>
                <Toaster />
                <SonnerToaster position="top-right" richColors />
            </QueryClientProvider>
        </AuthProvider>
    )
}

export default App
