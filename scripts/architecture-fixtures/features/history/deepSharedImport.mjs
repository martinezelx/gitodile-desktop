// Seeded violation: reaches past shared/ui's public entry point.
import { sharedInternalValue } from "../../shared/ui/internal.mjs";

export const forbiddenSharedValue = sharedInternalValue;
