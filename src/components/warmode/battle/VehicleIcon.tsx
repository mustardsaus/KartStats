"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { VEHICLES_BY_ID, vehicleImageUrl } from "@/lib/data/karts";

/**
 * Same idea as CharacterIcon, for the vehicle roster -- small gallery
 * icons bundled under public/vehicles/ for all 36 vehicles. Falls back to
 * a plain colored dot (no initials; vehicle names don't read well as a
 * single letter) if an id has no image.
 */
export function VehicleIcon({
  vehicleId,
  accent,
  size = "sm",
  className,
}: {
  vehicleId: string;
  accent: "adi" | "ren";
  size?: "sm" | "md";
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const name = VEHICLES_BY_ID.get(vehicleId)?.name ?? vehicleId;
  const dimension = size === "sm" ? "h-6 w-6" : "h-10 w-10";

  if (!imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small decorative icon, not worth next/image's config here
      <img
        src={vehicleImageUrl(vehicleId)}
        alt={name}
        title={name}
        onError={() => setImageFailed(true)}
        className={cn("inline-block shrink-0 rounded-md bg-surface object-contain p-0.5", dimension, className)}
      />
    );
  }

  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md",
        size === "sm" ? "h-6 w-6" : "h-10 w-10",
        accent === "adi" ? "bg-adi/25" : "bg-ren/25",
        className
      )}
    />
  );
}
