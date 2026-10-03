import { useRef, useState } from "react";

export type ToolNotice = {
  tone: "success" | "neutral" | "warning" | "danger";
  message: string;
};

/** A later tool action or check supersedes receipts from earlier async actions. */
export function useToolNotice() {
  const [notice, setNotice] = useState<ToolNotice | null>(null);
  const generation = useRef(0);
  const clear = (): void => {
    generation.current += 1;
    setNotice(null);
  };
  const begin = (): ((next: ToolNotice) => void) => {
    clear();
    const request = generation.current;
    return (next) => {
      if (generation.current === request) setNotice(next);
    };
  };
  return { notice, clear, begin };
}
