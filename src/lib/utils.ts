import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { PlaceHolderImages } from "./placeholder-images"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCaregiverAvatarUrl(caregiver: { profilePictureUrl?: string; name: string; id: string }) {
  if (caregiver.profilePictureUrl) {
    return caregiver.profilePictureUrl;
  }

  // Get avatar placeholders
  const avatarPlaceholders = PlaceHolderImages.filter(img => img.id.startsWith('avatar-'));

  // Use a simple hash of the name to pick a consistent avatar
  const hash = caregiver.name.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  const index = Math.abs(hash) % avatarPlaceholders.length;
  return avatarPlaceholders[index].imageUrl;
}
