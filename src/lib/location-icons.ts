import {
  Briefcase,
  Bus,
  Coffee,
  Dumbbell,
  GraduationCap,
  Heart,
  Home,
  MapPin,
  Music,
  Plane,
  ShoppingCart,
  Stethoscope,
  Train,
  type LucideIcon,
} from "lucide-react";

export const LOCATION_ICONS = [
  { name: "Train", Component: Train },
  { name: "Bus", Component: Bus },
  { name: "Briefcase", Component: Briefcase },
  { name: "Heart", Component: Heart },
  { name: "Coffee", Component: Coffee },
  { name: "Dumbbell", Component: Dumbbell },
  { name: "ShoppingCart", Component: ShoppingCart },
  { name: "GraduationCap", Component: GraduationCap },
  { name: "Plane", Component: Plane },
  { name: "Home", Component: Home },
  { name: "Stethoscope", Component: Stethoscope },
  { name: "Music", Component: Music },
] as const;

export type LocationIconName = (typeof LOCATION_ICONS)[number]["name"];

const ICON_NAMES = LOCATION_ICONS.map((i) => i.name) as LocationIconName[];

export function isLocationIconName(value: string): value is LocationIconName {
  return (ICON_NAMES as string[]).includes(value);
}

export function iconComponentFor(name: string): LucideIcon {
  const found = LOCATION_ICONS.find((i) => i.name === name);
  return found?.Component ?? MapPin;
}

export const MAX_LOCATIONS = 5;
