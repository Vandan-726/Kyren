import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                default:
                    "bg-brand-black text-brand-black-foreground shadow-[0_14px_28px_-12px_rgba(23,23,25,0.75)] hover:shadow-[0_18px_36px_-12px_rgba(23,23,25,0.85)] hover:scale-[1.02]",
                primary:
                    "bg-primary text-primary-foreground shadow-[0_14px_28px_-12px_rgba(227,74,50,0.6)] hover:shadow-[0_18px_36px_-12px_rgba(227,74,50,0.75)] hover:scale-[1.02]",
                destructive:
                    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
                outline:
                    "border border-border bg-card text-foreground shadow-[0_8px_20px_-14px_rgba(35,36,39,0.2)] hover:bg-muted hover:shadow-[0_12px_26px_-14px_rgba(35,36,39,0.28)]",
                secondary:
                    "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
                ghost: "hover:bg-muted hover:text-foreground",
                link: "text-primary underline-offset-4 hover:underline",
            },
            size: {
                default: "h-11 px-6 py-2",
                sm: "h-9 px-4 text-xs",
                lg: "h-12 px-8 text-base",
                icon: "h-11 w-11",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
        (<Comp
            className={cn(buttonVariants({ variant, size, className }))}
            ref={ref}
            {...props} />)
    );
})
Button.displayName = "Button"

export { Button, buttonVariants }