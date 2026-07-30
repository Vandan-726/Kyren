import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, ArrowRight, ArrowLeft, Mic, Type, GraduationCap, Target } from "lucide-react";
import { INDIAN_LANGUAGES } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

const EDUCATION_LEVELS = ["School (Class 8-10)", "School (Class 11-12)", "Undergraduate", "Postgraduate", "Self-taught"];
const STEM_INTERESTS = ["Programming", "Data Science", "AI/ML", "Mathematics", "Physics", "Chemistry", "Biology", "Engineering"];
const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced"];

export default function Onboarding() {
    const navigate = useNavigate();
    const { user, checkUserAuth } = useAuth();
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState({
        name: user?.full_name || "",
        language: "en",
        inputPreference: "text",
        educationLevel: "",
        interests: [],
        skillLevel: "Beginner",
        learningGoal: "",
    });

    const steps = ["Name", "Language", "Input Style", "Education", "Interests", "Skill Level", "Goal"];

    const handleNext = () => {
        if (step < steps.length - 1) setStep(step + 1);
    };

    const handleBack = () => {
        if (step > 0) setStep(step - 1);
    };

    const toggleInterest = (interest) => {
        setData((prev) => ({
            ...prev,
            interests: prev.interests.includes(interest)
                ? prev.interests.filter((i) => i !== interest)
                : [...prev.interests, interest],
        }));
    };

    const handleFinish = async () => {
        setSaving(true);
        try {
            await kyren.auth.updateMe({
                full_name: data.name,
                preferred_language: data.language,
                input_preference: data.inputPreference,
                education_level: data.educationLevel,
                stem_interests: data.interests,
                current_skill_level: data.skillLevel,
                learning_goal: data.learningGoal,
                onboarding_complete: true,
            });
            await checkUserAuth();
            navigate("/dashboard");
        } catch (e) {
            console.error("Onboarding save failed", e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 sf-atmosphere pointer-events-none" />
            <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/[0.05] blur-[100px] sf-drift pointer-events-none" />

            <div className="relative w-full max-w-2xl sf-rise">
                {/* Logo */}
                <div className="flex items-center justify-center gap-2.5 mb-8">
                    <div className="w-10 h-10 rounded-xl bg-brand-black flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-primary" />
                    </div>
                    <span className="sf-display text-2xl text-foreground">KYREN</span>
                </div>

                {/* Progress */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {steps.map((s, i) => (
                        <div
                            key={s}
                            className={cn(
                                "h-1.5 rounded-full transition-all",
                                i <= step ? "w-8 bg-primary" : "w-4 bg-muted"
                            )}
                        />
                    ))}
                </div>

                <div className="sf-card-inset rounded-2xl p-8">
                    {/* Step 0: Name */}
                    {step === 0 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="sf-display text-2xl text-foreground">Welcome to <span className="sf-serif text-primary">KYREN!</span></h2>
                                <p className="text-text-secondary mt-1">What should we call you?</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Your Name</Label>
                                <Input
                                    value={data.name}
                                    onChange={(e) => setData({ ...data, name: e.target.value })}
                                    placeholder="Enter your name"
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 1: Language */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="sf-display text-2xl text-foreground">Choose Your Language</h2>
                                <p className="text-text-secondary mt-1">KYREN will teach you in your language.</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {INDIAN_LANGUAGES.map((lang) => (
                                    <button
                                        key={lang.code}
                                        onClick={() => setData({ ...data, language: lang.code })}
                                        className={cn(
                                            "p-4 rounded-xl border text-left transition",
                                            data.language === lang.code
                                                ? "border-primary bg-primary/5"
                                                : "border-border bg-card hover:border-primary/30"
                                        )}
                                    >
                                        <div className="sf-serif text-lg text-foreground">{lang.native}</div>
                                        <div className="text-xs text-text-secondary">{lang.name}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Input Style */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="sf-display text-2xl text-foreground">How Do You Like to Learn?</h2>
                                <p className="text-text-secondary mt-1">Voice or text? You can change this anytime.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { value: "text", icon: Type, title: "Text", desc: "Type your questions and answers" },
                                    { value: "voice", icon: Mic, title: "Voice", desc: "Speak to KYREN with voice input and audio responses" },
                                ].map((opt) => {
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => setData({ ...data, inputPreference: opt.value })}
                                            className={cn(
                                                "p-6 rounded-2xl border text-center transition",
                                                data.inputPreference === opt.value
                                                    ? "border-primary bg-primary/5"
                                                    : "border-border bg-card hover:border-primary/30"
                                            )}
                                        >
                                            <Icon className="w-8 h-8 mx-auto mb-3 text-primary" />
                                            <div className="font-medium mb-1 text-foreground">{opt.title}</div>
                                            <div className="text-xs text-text-secondary">{opt.desc}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Education */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="sf-display text-2xl text-foreground">Your Education Level</h2>
                                <p className="text-text-secondary mt-1">This helps us calibrate content difficulty.</p>
                            </div>
                            <div className="space-y-2">
                                {EDUCATION_LEVELS.map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => setData({ ...data, educationLevel: level })}
                                        className={cn(
                                            "w-full p-4 rounded-xl border text-left flex items-center gap-3 transition",
                                            data.educationLevel === level
                                                ? "border-primary bg-primary/5"
                                                : "border-border bg-card hover:border-primary/30"
                                        )}
                                    >
                                        <GraduationCap className="w-5 h-5 text-primary" />
                                        <span className="text-foreground">{level}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Interests */}
                    {step === 4 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="sf-display text-2xl text-foreground">Your STEM Interests</h2>
                                <p className="text-text-secondary mt-1">Pick what excites you. Select all that apply.</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {STEM_INTERESTS.map((interest) => (
                                    <button
                                        key={interest}
                                        onClick={() => toggleInterest(interest)}
                                        className={cn(
                                            "px-5 py-2.5 rounded-full border text-sm font-medium transition",
                                            data.interests.includes(interest)
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border bg-card text-foreground hover:border-primary/30"
                                        )}
                                    >
                                        {interest}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 5: Skill Level */}
                    {step === 5 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="sf-display text-2xl text-foreground">Your Current Skill Level</h2>
                                <p className="text-text-secondary mt-1">Don't worry — KYREN will verify this through conversation.</p>
                            </div>
                            <div className="space-y-2">
                                {SKILL_LEVELS.map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => setData({ ...data, skillLevel: level })}
                                        className={cn(
                                            "w-full p-4 rounded-xl border text-left transition",
                                            data.skillLevel === level
                                                ? "border-primary bg-primary/5"
                                                : "border-border bg-card hover:border-primary/30"
                                        )}
                                    >
                                        <span className="font-medium text-foreground">{level}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 6: Goal */}
                    {step === 6 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="sf-display text-2xl text-foreground">Your Learning <span className="sf-serif text-primary">Goal</span></h2>
                                <p className="text-text-secondary mt-1">What do you want to achieve? Be specific if you can.</p>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-start gap-2 text-sm text-text-secondary">
                                    <Target className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                                    <p>Example: "I want to learn DSA and get a job as a software developer."</p>
                                </div>
                                <textarea
                                    value={data.learningGoal}
                                    onChange={(e) => setData({ ...data, learningGoal: e.target.value })}
                                    placeholder="Tell us your learning goal..."
                                    className="w-full p-4 rounded-xl bg-card border border-border min-h-[120px] resize-none focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition"
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={step === 0}
                            className="text-text-secondary hover:text-foreground"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                        {step < steps.length - 1 ? (
                            <Button variant="primary" onClick={handleNext} disabled={step === 0 && !data.name} className="rounded-full">
                                Next
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        ) : (
                            <Button variant="primary" onClick={handleFinish} disabled={saving} className="rounded-full">
                                {saving ? "Setting up..." : "Start Learning"}
                                {!saving && <ArrowRight className="w-4 h-4 ml-2" />}
                            </Button>
                        )}
                    </div>

                    {step < steps.length - 1 && (
                        <button
                            onClick={() => setStep(steps.length - 1)}
                            className="w-full text-center text-xs text-muted-foreground hover:text-text-secondary mt-4 transition"
                        >
                            Skip to end
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}