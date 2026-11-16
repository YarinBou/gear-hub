// Theme preference. The app follows the device's light / dark setting unless the user picked one
// on this device (the switch on /more and /account). The choice lives in localStorage: it is a
// per-device preference, and reading a cookie in the root layout would make every page dynamic.

export const THEME_STORAGE_KEY = "gh_theme";
export const THEME_CHANGE_EVENT = "gh-theme-change";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Runs in <head> before first paint (Next guide: "preventing flash before hydration") and keeps
 * following the device setting, other tabs and the switch afterwards. Sets or removes `.dark` on
 * <html>; globals.css does the rest. Dependency-free on purpose — it is inlined as a string.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}d.classList.toggle("dark",t==="dark"||(t!=="light"&&m.matches))}a();m.addEventListener("change",a);window.addEventListener("storage",a);window.addEventListener("${THEME_CHANGE_EVENT}",a)}catch(e){}})()`;
