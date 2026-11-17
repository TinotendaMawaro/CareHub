"use client";

import { forwardRef } from "react";

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number | string;
}

export const CareHubLogo = forwardRef<HTMLImageElement, LogoProps>(
  ({ size = 32, className = "", ...props }, ref) => (
    <img
      ref={ref}
      src="/carehub logo.png"
      alt="CareHub"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={className}
      {...props}
    />
  )
);

CareHubLogo.displayName = "CareHubLogo";

export const CareHubLogoWithText = ({
  size = 24,
  className = "",
}: {
  size?: number | string;
  className?: string;
}) => (
  <div className={`flex items-center justify-center ${className}`}>
    <CareHubLogo size={size} className="text-primary" />
  </div>
);