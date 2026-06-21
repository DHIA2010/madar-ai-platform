import {
  clearStorageScope,
  createScopedZustandStorage,
  createStorageAdapter,
} from "@/infrastructure"

export function getLocalStorageAdapter() {
  return createStorageAdapter("local")
}

export function getSessionStorageAdapter() {
  return createStorageAdapter("session")
}

export function createLocalZustandStorage() {
  return createScopedZustandStorage("local")
}

export function createSessionZustandStorage() {
  return createScopedZustandStorage("session")
}

export function clearLocalStorage() {
  clearStorageScope("local")
}

export function clearSessionStorage() {
  clearStorageScope("session")
}
