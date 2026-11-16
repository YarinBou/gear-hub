"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Light / dark / follow-the-device. Saves the choice on this device and tells the theme script in
 * <head> (THEME_SCRIPT) to re-apply it; nothing goes to the server.
 */
export function ThemeSwitch() {
  const value = useSyncExternalStore(subscribe, read, () => "system" as ThemePreference);

  const choose = (next: string) => {
    // Radix lets a single-choice group be cleared by tapping the active item; keep the current choice.
    if (next !== "system" && next !== "light" && next !== "dark") return;
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice applies now but will not persist.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <ToggleGroup type="single" variant="outline" value={value} onValueChange={choose} aria-label="מצב תצוגה" className="w-full">
      <ToggleGroupItem value="system" className="flex-1">
        <SunMoon aria-hidden />
        אוטומטי
      </ToggleGroupItem>
      <ToggleGroupItem value="light" className="flex-1">
        <Sun aria-hidden />
        בהיר
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" className="flex-1">
        <Moon aria-hidden />
        כהה
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
