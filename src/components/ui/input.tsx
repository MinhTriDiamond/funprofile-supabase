import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Phase 2.3 — Mobile keyboard UX
 * Tự động chọn inputMode hợp lý theo `type` để mở đúng bàn phím
 * trên mobile mà KHÔNG phá luồng cũ — caller vẫn có thể override
 * bằng cách truyền inputMode rõ ràng.
 */
function inferInputMode(
  type: React.HTMLInputTypeAttribute | undefined,
): React.HTMLAttributes<HTMLInputElement>["inputMode"] | undefined {
  switch (type) {
    case "number":
      return "decimal";
    case "tel":
      return "tel";
    case "email":
      return "email";
    case "url":
      return "url";
    case "search":
      return "search";
    default:
      return undefined;
  }
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, inputMode, autoComplete, ...props }, ref) => {
    const resolvedInputMode = inputMode ?? inferInputMode(type);
    return (
      <input
        type={type}
        inputMode={resolvedInputMode}
        autoComplete={autoComplete}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
