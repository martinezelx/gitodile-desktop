import React from "react";
import { DialogCloseButton } from "./dialogCloseButton";

/** DESIGN.md § Dialogs: three sizes, never a width of a dialog's own. */
export type DialogSize = "s" | "m" | "l";
/** The header glyph's fill. `accent` is a flow's own mark; the status tones
 * say what kind of message this is before the sentence is read. */
export type DialogTone = "accent" | "success" | "warning" | "danger" | "neutral";

export type DialogProps = {
  size: DialogSize;
  title: React.ReactNode;
  titleId: string;
  subtitle?: React.ReactNode;
  descriptionId?: string;
  /** A lucide icon element. Given, the header leads with it in a circle. */
  icon?: React.ReactNode;
  tone?: DialogTone;
  role?: "dialog" | "alertdialog";
  /** Given, the header carries the close button and the backdrop dismisses. */
  onClose?: () => void;
  closeLabel?: string;
  /** False while work that cannot be interrupted runs: no close button, no
   * backdrop dismissal. */
  dismissible?: boolean;
  dialogRef?: React.Ref<HTMLDivElement>;
  titleRef?: React.Ref<HTMLHeadingElement>;
  className?: string;
  bodyProps?: React.HTMLAttributes<HTMLDivElement>;
  children: React.ReactNode;
};

/** The one shell every action dialog wears: backdrop, surface, header and
 * the body the caller supplies. Focus management stays with the caller —
 * dialogs differ in where focus lands — but the shape does not. */
export function Dialog({
  size,
  title,
  titleId,
  subtitle,
  descriptionId,
  icon,
  tone = "accent",
  role = "dialog",
  onClose,
  closeLabel = "Close",
  dismissible = true,
  dialogRef,
  titleRef,
  className = "",
  bodyProps,
  children,
}: DialogProps): React.JSX.Element {
  const canClose = Boolean(onClose) && dismissible;
  return (
    <div
      className="app-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && canClose) onClose?.();
      }}
    >
      <div
        {...bodyProps}
        ref={dialogRef}
        className={`app-dialog app-dialog--${size} ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="app-dialog__head">
          {icon && <span className={`app-dialog__glyph app-dialog__glyph--${tone}`} aria-hidden="true">{icon}</span>}
          <div className="app-dialog__titles">
            <h2 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h2>
            {subtitle && <p className="app-dialog__subtitle">{subtitle}</p>}
          </div>
          {canClose && <DialogCloseButton label={closeLabel} onClick={() => onClose?.()} />}
        </header>
        {children}
      </div>
    </div>
  );
}

export type DialogFact = { icon: React.ReactNode; text: React.ReactNode; safe?: boolean };

/** "What will happen": two or three lines, the safety line last. */
export function DialogFacts({ facts, label }: { facts: DialogFact[]; label?: string }): React.JSX.Element {
  return (
    <ul className="app-dialog__facts" aria-label={label}>
      {facts.map((fact, index) => (
        <li key={index} className={fact.safe ? "app-dialog__fact app-dialog__fact--safe" : "app-dialog__fact"}>
          <span aria-hidden="true">{fact.icon}</span>
          <span>{fact.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** A problem or a condition inside a dialog, with an optional way out. */
export function DialogBanner({
  tone,
  icon,
  children,
  role,
}: {
  tone: "warning" | "danger" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
  role?: "alert" | "status";
}): React.JSX.Element {
  return (
    <div className={`app-dialog__banner app-dialog__banner--${tone}`} role={role}>
      <span aria-hidden="true">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
