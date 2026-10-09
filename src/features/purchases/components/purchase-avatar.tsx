import { AppAvatar, AppAvatarFallback, AppAvatarImage } from "@/components/app"

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
]

function toneFor(name: string): string {
  const sum = name.split("").reduce((total, char) => total + char.charCodeAt(0), 0)
  return AVATAR_TONES[sum % AVATAR_TONES.length]
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function PurchaseAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string
  imageUrl: string | null
  className?: string
}) {
  return (
    <AppAvatar className={className}>
      {imageUrl ? <AppAvatarImage src={imageUrl} alt={name} /> : null}
      <AppAvatarFallback className={toneFor(name)}>{initialsFor(name)}</AppAvatarFallback>
    </AppAvatar>
  )
}
