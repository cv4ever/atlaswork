// Carlos's cartoon portrait for his own dev server. Product builds never load this folder (src/main.tsx imports it
// behind `import.meta.env.DEV`), so strangers see the generic profile picture instead (onboarding, 2026-11-05).
import portrait from "./carlos.webp";

export { portrait };
