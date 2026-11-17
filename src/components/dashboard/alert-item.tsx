"use client";

import { AlertTriangle, ShieldAlert, UserX, Activity } from "lucide-react";

interface AlertItemProps {
  icon: React.ReactNode;
  count: number;
  title: string;
  description: string;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  titleColor: string;
  descriptionColor: string;
}

export function AlertItem({
  icon,
  count,
  title,
  description,
  iconColor,
  bgColor,
  borderColor,
  titleColor,
  descriptionColor,
}: AlertItemProps) {
  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg ${bgColor} ${borderColor}`}
    >
      <div className={iconColor}>{icon}</div>
      <div>
        <p className={`font-medium ${titleColor}`}>
          {count} {title}
        </p>
        <p className={`text-sm ${descriptionColor}`}>{description}</p>
      </div>
    </div>
  );
}
