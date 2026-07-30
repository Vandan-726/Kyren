import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
    <input
        type={type}
        ref={ref}
        className={cn(
            "flex h-12 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm text-foreground transition-all",
            "placeholder:text-foreground/50",
            "focus-visible:outline-none focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "hover:border-border/80",
            className
        )}
        {...props}
    />
))
Input.displayName = "Input"

export { Input }