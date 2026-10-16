import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Royal Premium - Glossy Green với Metallic Gold Border
        default: "bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#E8D5A3] font-semibold rounded-full border-[2px] border-[#DAA520] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.15),0_0_8px_rgba(218,165,32,0.4),0_2px_4px_rgba(0,0,0,0.2)] hover:from-[#1d8a4c] hover:via-[#188639] hover:to-[#0e5530] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_12px_rgba(218,165,32,0.5),0_3px_6px_rgba(0,0,0,0.25)] hover:scale-[1.02] duration-300",
        destructive: "bg-gradient-to-b from-[#dc2626] via-[#b91c1c] to-[#991b1b] text-white font-semibold rounded-full border-[2px] border-[#DAA520]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-[#ef4444] hover:via-[#dc2626] hover:to-[#b91c1c] duration-300",
        outline: "bg-transparent text-[#DAA520] font-semibold rounded-full border-[2px] border-[#DAA520] shadow-[0_0_6px_rgba(218,165,32,0.3)] hover:bg-[#166534]/20 hover:text-[#FFD700] hover:shadow-[0_0_10px_rgba(218,165,32,0.5)] duration-300",
        secondary: "bg-gradient-to-b from-[#f8f6f0] to-[#f0ede4] text-[#166534] font-semibold rounded-full border-[2px] border-[#DAA520]/60 shadow-[0_0_4px_rgba(218,165,32,0.2)] hover:border-[#DAA520] hover:shadow-[0_0_8px_rgba(218,165,32,0.4)] duration-300",
        ghost: "text-[#DAA520] rounded-full hover:bg-[#166534]/15 hover:text-[#FFD700] border-[2px] border-transparent hover:border-[#DAA520]/40 duration-300",
        link: "text-[#DAA520] underline-offset-4 hover:underline hover:text-[#FFD700] rounded-full",
        premium: "bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#FFD700] font-bold rounded-full border-[2px] border-[#DAA520] shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-2px_0_rgba(0,0,0,0.2),0_0_12px_rgba(255,215,0,0.5),0_3px_8px_rgba(0,0,0,0.3)] hover:from-[#1d8a4c] hover:via-[#188639] hover:to-[#0e5530] hover:shadow-[inset_0_2px_0_rgba(255,255,255,0.3),0_0_16px_rgba(255,215,0,0.6),0_4px_12px_rgba(0,0,0,0.35)] hover:scale-[1.03] duration-300",
        light: "bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#E8D5A3] font-semibold rounded-full border-[1.5px] border-[#DAA520]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_6px_rgba(218,165,32,0.3)] hover:border-[#DAA520] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_10px_rgba(218,165,32,0.5)] duration-300",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-8",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
