"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  AppAvatar,
  AppAvatarFallback,
  AppAvatarImage,
  AppButton,
  AppCard,
  AppInput,
  AppPageHeader,
} from "@/components/app"

import { useAuth } from "@/features/authentication"

function getInitials(fullName: string | undefined, fallback: string) {
  if (!fullName) {
    return fallback
  }
  const parts = fullName.trim().split(/\s+/)
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
  return initials.toUpperCase() || fallback
}

export default function EditProfile() {
  const t = useTranslations("account.editProfile")
  const { currentUser, updateProfile, uploadAvatar, removeAvatar } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(currentUser?.fullName ?? "")
  const [isSavingName, setIsSavingName] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false)

  const nameChanged = fullName.trim().length > 0 && fullName.trim() !== currentUser?.fullName

  async function handleSaveName() {
    if (!nameChanged) return
    setIsSavingName(true)
    try {
      await updateProfile({ fullName: fullName.trim() })
      toast.success(t("toasts.profileUpdated"))
    } catch {
      toast.error(t("toasts.profileUpdateFailed"))
    } finally {
      setIsSavingName(false)
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setIsUploadingAvatar(true)
    try {
      await uploadAvatar(file)
      toast.success(t("toasts.photoUpdated"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.photoUploadFailed"))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  async function handleRemoveAvatar() {
    setIsRemovingAvatar(true)
    try {
      await removeAvatar()
      toast.success(t("toasts.photoRemoved"))
    } catch {
      toast.error(t("toasts.photoRemoveFailed"))
    } finally {
      setIsRemovingAvatar(false)
    }
  }

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-2xl space-y-4">
        <AppPageHeader title={t("title")} subtitle={t("subtitle")} />

        <AppCard contentClassName="space-y-6">
          <div className="flex flex-wrap items-center gap-6">
            <AppAvatar className="h-24 w-24">
              {currentUser?.avatarUrl ? <AppAvatarImage src={currentUser.avatarUrl} /> : null}
              <AppAvatarFallback className="text-2xl">
                {getInitials(currentUser?.fullName, t("initialsFallback"))}
              </AppAvatarFallback>
            </AppAvatar>
            <div className="space-y-2">
              <div className="flex gap-2">
                <AppButton
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? t("uploading") : t("uploadPhoto")}
                </AppButton>
                {currentUser?.avatarUrl ? (
                  <AppButton
                    variant="ghost"
                    onClick={handleRemoveAvatar}
                    disabled={isRemovingAvatar}
                  >
                    {isRemovingAvatar ? t("removing") : t("remove")}
                  </AppButton>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{t("photoHint")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>

          <div className="space-y-3">
            <AppInput
              label={t("nameLabel")}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            <AppInput label={t("emailLabel")} value={currentUser?.email ?? ""} disabled />
          </div>

          <div className="flex justify-end">
            <AppButton onClick={handleSaveName} disabled={!nameChanged || isSavingName}>
              {isSavingName ? t("saving") : t("saveChanges")}
            </AppButton>
          </div>
        </AppCard>
      </div>
    </div>
  )
}
