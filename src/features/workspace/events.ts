// Switching, archiving, or restoring a workspace changes what data is
// scoped to the active workspace on the backend, but any already-mounted
// view (e.g. the integrations page) has no way to know that happened -- it
// only has its own fetched-at-mount-time state. This event lets such views
// refetch without requiring a shared cache/query layer.
export const WORKSPACE_LIFECYCLE_CHANGED_EVENT = "madar:workspace-lifecycle-changed"

export function emitWorkspaceLifecycleChanged() {
  if (typeof window === "undefined") {
    return
  }
  window.dispatchEvent(new Event(WORKSPACE_LIFECYCLE_CHANGED_EVENT))
}

export function onWorkspaceLifecycleChanged(handler: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }
  window.addEventListener(WORKSPACE_LIFECYCLE_CHANGED_EVENT, handler)
  return () => window.removeEventListener(WORKSPACE_LIFECYCLE_CHANGED_EVENT, handler)
}
