"use client";

import { useEffect, useState } from "react";

type Permission = {
  model: string;
  action: string;
};

export function usePermission() {
  const [permissions, setPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem("hr_user_role") || "[]");
        setPermissions(Array.isArray(parsed) ? parsed.filter((permission): permission is Permission =>
          permission !== null && typeof permission === "object" &&
          typeof permission.model === "string" && typeof permission.action === "string",
        ) : []);
      } catch {
        setPermissions([]);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function checkRole(model: string, action: string) {
    const result = permissions.some(
      (permission) =>
        permission.model === model && permission.action === action,
    );

    return result;
  }

  function checkRoleMulti(model: string, actions: string[]) {
    return permissions.some(
      (permission) =>
        permission.model === model && actions.includes(permission.action),
    );
  }

  return { checkRole, checkRoleMulti, permissions };
}
