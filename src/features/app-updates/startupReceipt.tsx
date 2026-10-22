import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";

import { useLanguage } from "../../i18n";
import { useToast } from "../../shared/ui";
import type { StartupUpdateConfirmation } from "./domain";
import { appUpdateTranslations } from "./translations";

/**
 * Says once, at startup, how the last install went.
 *
 * A confirmed update is a result with no next step, so it is a toast — the
 * app opens onto the reader's work, not onto a dialog about the updater that
 * then rewrote itself when the automatic check started. Its one action leads
 * to what the new version brings, and only when the version has something to
 * say. A restart on the wrong version does need the reader, so it opens the
 * update dialog, where the manual download is.
 */
export function useStartupUpdateReceipt({
  confirmation,
  onOpenWhatsNew,
  onOpenDialog,
}: {
  confirmation: StartupUpdateConfirmation;
  /** Absent when the running release has no highlights to show. */
  onOpenWhatsNew?: () => void;
  onOpenDialog: () => void;
}): void {
  const { language } = useLanguage();
  const showToast = useToast();
  const presented = useRef(false);

  useEffect(() => {
    if (presented.current || confirmation.kind === "none") return;
    presented.current = true;
    if (confirmation.kind === "unconfirmed") {
      onOpenDialog();
      return;
    }
    const t = appUpdateTranslations(language);
    showToast({
      message: t.startupConfirmed(confirmation.version),
      icon: <CheckCircle2 />,
      action: onOpenWhatsNew ? { label: t.seeWhatsNew, onAction: onOpenWhatsNew } : undefined,
    });
  }, [confirmation, language, onOpenDialog, onOpenWhatsNew, showToast]);
}
