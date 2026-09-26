import React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type BackgroundProps = {
  children: React.ReactNode;
  variant?: "top" | "bottom" | "full" | "brand" | "accent";
  className?: string;
};

export const Background: React.FC<BackgroundProps> = ({
  children,
  variant = "top",
  className,
}) => {
  let variantClass = "";

  if (variant === "top") {
    // Rich Coursera soft blue fading into white with blue border accent
    variantClass =
      "bg-gradient-to-b from-[#E2EDFF] via-[#F0F6FF] to-white ";
  } else if (variant === "bottom") {
    // Clean white fading down into rich Coursera light blue
    variantClass =
      "bg-gradient-to-b from-white via-[#F0F6FF] to-[#E2EDFF] ";
  } else if (variant === "accent") {
    // Solid Coursera Light Tint (High visibility against white)
    variantClass = "bg-[#EBF3FF] ";
  } else if (variant === "brand") {
    // Solid Coursera Primary Blue (#0056D2) - Bold hero or pricing card
    variantClass = "bg-[#0056D2] text-white  ";
  } else if (variant === "full") {
    variantClass = "bg-[#F3F7FE]  ";
  }

  return (
    <div
      className={cn(
        "relative mx-3 my-4 sm:mx-6 lg:mx-8 rounded-3xl lg:rounded-4xl overflow-hidden  transition-all",
        variantClass,
        className
      )}
    >
      {children}
    </div>
  );
};

export default Background;