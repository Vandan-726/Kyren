import React, { useState } from "react";
import { Link } from "react-router-dom";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await kyren.auth.resetPasswordRequest(email);
        } catch (err) {
            // Always show success state for security, but log the error
            console.error("Forgot password failed", err);
        } finally {
            setLoading(false);
            setSent(true);
        }
    };

    return (
        <AuthLayout
            icon={Mail}
            title="Reset password"
            subtitle="We'll send you a link to reset it"
            footer={
                <Link to="/login" className="text-primary font-medium hover:underline">
                    <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
                </Link>
            }
        >
            {sent ? (
                <div className="space-y-4 text-center">
                    <p className="text-sm text-foreground">
                        If an account exists with that email, you'll receive a password reset link shortly.
                    </p>
                    {localStorage.getItem("dev_reset_token") && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-600 dark:text-yellow-400 space-y-2">
                            <p><strong>Dev Note:</strong> Email sending is mocked. You can use the link below to test the reset:</p>
                            <Link 
                                to={`/reset-password?token=${localStorage.getItem("dev_reset_token")}`}
                                className="block font-medium underline text-primary"
                                onClick={() => {
                                    // Keep it for the next page, or clear it on load of next page
                                }}
                            >
                                Go to Reset Password Page
                            </Link>
                        </div>
                    )}
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email address</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                autoFocus
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-10 h-12"
                                required
                            />
                        </div>
                    </div>
                    <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            "Send reset link"
                        )}
                    </Button>
                </form>
            )}
        </AuthLayout>
    );
}

