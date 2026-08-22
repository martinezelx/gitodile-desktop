import React from "react";
import { X } from "lucide-react";

export function DialogCloseButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button className="dialog-close-button" type="button" aria-label={label} onClick={onClick}>
      <X aria-hidden="true" />
    </button>
  );
}
