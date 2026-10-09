"use client";

import { useMemo, useSyncExternalStore } from "react";

export const CLIENT_SESSION_UPDATED_EVENT = "hr-session-updated";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CLIENT_SESSION_UPDATED_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CLIENT_SESSION_UPDATED_EVENT, callback);
  };
}

function getFeatureSnapshot() {
  try {
    const user = JSON.parse(localStorage.getItem("hr_user_data") || "{}");
    if (user.featurePermissions == null) return "null";
    return JSON.stringify(
      Array.isArray(user.featurePermissions) ? user.featurePermissions : [],
    );
  } catch {
    return "null";
  }
}

export function usePlanFeatures() {
  const snapshot = useSyncExternalStore(subscribe, getFeatureSnapshot, () => "null");

  return useMemo<string[] | null>(() => {
    if (snapshot === "null") return null;
    try {
      const value = JSON.parse(snapshot);
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }, [snapshot]);
}
