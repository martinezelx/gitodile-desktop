import React from "react";

export const CROCODILE_MARK = <span className="gitodile-mark" aria-hidden="true" />;

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
export const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl";
