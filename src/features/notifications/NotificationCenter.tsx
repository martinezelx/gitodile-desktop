import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Settings, Trash2 } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { formatDate, type LocaleFormats } from "../../shared/i18n";
import {
  autoHideScrollbarProps,
  isReducedMotionRequested,
  usePortalFlyout,
} from "../../shared/ui";
import {
  NOTIFICATION_KINDS,
  notificationAction,
  type AppNotification,
  type NotificationDetails,
} from "./domain";
import { NOTIFICATION_ICONS } from "./icons";

/** The panel's own relative clock. The status bar has one too, but it belongs
 * to the app shell and a feature may not reach into it; this one is four lines
 * and needs no shared primitive to justify itself. */
function relativeTime(createdAt: number, now: number, language: string, justNow: string): string {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < 45_000) return justNow;
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "always", style: "short" });
  if (elapsed < 60 * 60_000) return formatter.format(-Math.round(elapsed / 60_000), "minute");
  if (elapsed < 24 * 60 * 60_000) return formatter.format(-Math.round(elapsed / (60 * 60_000)), "hour");
  return formatter.format(-Math.round(elapsed / (24 * 60 * 60_000)), "day");
}

/** One place where a kind becomes words, so a new kind fails to compile until
 * it has been given some. */
function describe(details: NotificationDetails, t: Translations): {
  title: string;
  description: string | null;
} {
  switch (details.kind) {
    case "teamChangesAvailable":
      return {
        title: t.notificationTeamChangesTitle(details.behind),
        description: t.notificationTeamChangesDescription,
      };
    case "remoteCheckFailed":
      return {
        title: t.notificationRemoteCheckFailedTitle,
        // The mapped reason when there is one, because it is the only part that
        // says anything specific; the generic sentence is the fallback, not a
        // preamble to repeat above it.
        // `||`, not `??`: an error mapper that produced an empty string would
        // otherwise leave the entry with a bare title and no explanation at
        // all, which is worse than the generic sentence.
        description: details.reason?.trim() || t.notificationRemoteCheckFailedDescription,
      };
    case "changesPublished":
      return {
        title: t.notificationChangesPublishedTitle(details.versionCount),
        description: details.destination === null
          ? null
          : t.notificationChangesPublishedTo(details.destination),
      };
  }
}

function NotificationRow({
  notification,
  wasUnread,
  now,
  formats,
  t,
  onAction,
}: {
  notification: AppNotification;
  wasUnread: boolean;
  now: number;
  formats: LocaleFormats;
  t: Translations;
  onAction: (notification: AppNotification) => void;
}): React.JSX.Element {
  const { title, description } = describe(notification.details, t);
  const tone = NOTIFICATION_KINDS[notification.details.kind].tone;
  const Icon = NOTIFICATION_ICONS[notification.details.kind];
  const action = notificationAction(notification);

  return (
    <li className={`notification${wasUnread ? " notification--unread" : ""}`}>
      <span className={`notification__icon notification__icon--${tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <div className="notification__body">
        <p className="notification__title">
          {title}
          {wasUnread && <span className="visually-hidden"> — {t.notificationsUnreadLabel}</span>}
        </p>
        {description && <p className="notification__description">{description}</p>}
        <p className="notification__meta">
          {notification.projectName && (
            <span className="notification__project">{notification.projectName}</span>
          )}
          <span title={formatDate(new Date(notification.createdAt), formats, "date-time")}>
            {relativeTime(notification.createdAt, now, formats.language, t.notificationsJustNow)}
          </span>
        </p>
        {action === "reviewTeamChanges" && (
          <button
            className="notification__action"
            type="button"
            onClick={() => onAction(notification)}
          >
            {t.notificationTeamChangesAction}
          </button>
        )}
      </div>
    </li>
  );
}

export type NotificationCenterProps = {
  notifications: readonly AppNotification[];
  unreadCount: number;
  /** The preference, not a derived state: the panel says out loud that it has
   * been turned off rather than pretending to be an empty inbox. */
  isEnabled: boolean;
  /** Called when the panel opens. The shell marks everything read; the rows
   * keep showing which ones *were* unread until the panel closes again. */
  onOpened: () => void;
  onClear: () => void;
  onReviewTeamChanges: (notification: AppNotification) => void;
  onOpenSettings: () => void;
};

/**
 * The titlebar bell and its panel.
 *
 * It sits beside the window controls rather than in the status bar because the
 * status bar answers "what is true now" and this answers "what happened while
 * you were elsewhere" — an inbox, which desktop apps keep in the window
 * furniture.
 *
 * The panel is portalled and positioned by `usePortalFlyout` for the same
 * reason the project switcher is: the titlebar is a fixed 44px strip, and an
 * absolutely positioned panel inside it would be clipped by the app window's
 * own overflow.
 */
export function NotificationCenter({
  notifications,
  unreadCount,
  isEnabled,
  onOpened,
  onClear,
  onReviewTeamChanges,
  onOpenSettings,
}: NotificationCenterProps): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  // Frozen at open time. Marking everything read on open is what clears the
  // badge, but it would also erase the per-row marks in the same frame, so the
  // panel would open showing nothing to look at first. This keeps the marks for
  // as long as the panel that revealed them stays open.
  const [seenUnreadIds, setSeenUnreadIds] = useState<ReadonlySet<string>>(new Set());
  // Sampled once per opening rather than on a timer: the panel is short-lived,
  // and a ticking clock behind a closed popup is background work for nothing.
  const [openedAt, setOpenedAt] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /* The bell moves for exactly one reason: something arrived while nobody was
   * looking, which is the only thing this centre exists to report.
   *
   * A press deliberately gets nothing. It was built and then removed: the bell
   * borrows `.titlebar-icon-button` outright so that it reads as one of the
   * row rather than as a special case, and a bell that answered a press while
   * the palette, the history arrows and the theme toggle sat still would have
   * been the one control there behaving differently for no reason the user
   * could name. Press feedback across that whole row is a decision about the
   * titlebar, not about notifications.
   *
   * On a rise, not on every arrival: a publish is recorded already read, and
   * announcing something the user just watched succeed is how a badge — or a
   * gesture — teaches people to ignore it. */
  const [isRinging, setIsRinging] = useState(false);
  const previousUnreadCount = useRef(unreadCount);
  /** Reduced motion means not starting the gesture at all, the same answer
   * `themeTransition.ts` gives. Decided here rather than in CSS because the
   * ring's class is cleared by `animationend`, and an animation suppressed to
   * `none` never ends — the class would stick to the element for the rest of
   * the session and no later ring could restart it. The badge keeps its own
   * reduced-motion rule in CSS, because nothing clears that one. */
  useEffect(() => {
    const rose = unreadCount > previousUnreadCount.current;
    previousUnreadCount.current = unreadCount;
    if (rose && !isReducedMotionRequested()) setIsRinging(true);
  }, [unreadCount]);

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  // `"container"`, not `"first-control"`: the panel's only header control is
  // "Clear all", and landing focus on a destructive button because it happens
  // to be first in the DOM would make Enter — the most reflexive key there is —
  // empty the list someone just opened to read. Focus goes to the panel itself,
  // which is why it carries `tabIndex={-1}`; from there Tab reaches the rows in
  // order.
  const { popupRef, style } = usePortalFlyout(isOpen, triggerRef, close, "below", "container");

  // Declared once and rendered by both branches below: the empty state and a
  // list that has stopped growing need the identical way back to the switch.
  const settingsButton = (
    <button
      className="notification-center__settings"
      type="button"
      onClick={() => {
        close(false);
        onOpenSettings();
      }}
    >
      <Settings aria-hidden="true" />
      <span>{t.notificationsOpenSettings}</span>
    </button>
  );

  const open = (): void => {
    setSeenUnreadIds(
      new Set(notifications.filter((entry) => !entry.read).map((entry) => entry.id)),
    );
    setOpenedAt(Date.now());
    setIsOpen(true);
    onOpened();
  };

  return (
    <div className="notification-center">
      <button
        ref={triggerRef}
        className="titlebar-icon-button notification-center__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t.notificationsTrigger(unreadCount)}
        data-tooltip={t.notificationsTitle}
        onClick={() => (isOpen ? close(true) : open())}
      >
        <Bell
          aria-hidden="true"
          className={isRinging ? "notification-center__bell--ring" : undefined}
          // Cleared on the animation itself rather than on a timer, so the class
          // goes exactly when the animation does and a later ring starts from a
          // clean element instead of a name that never left.
          onAnimationEnd={() => setIsRinging(false)}
        />
        {unreadCount > 0 && (
          <span className="notification-center__badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {isOpen && createPortal(
        <div
          ref={popupRef}
          className="app-menu notification-center__panel"
          role="dialog"
          tabIndex={-1}
          aria-label={t.notificationsPanelAriaLabel}
          style={style}
        >
          <header className="notification-center__header">
            <h2>{t.notificationsTitle}</h2>
            <button
              className="notification-center__header-action"
              type="button"
              disabled={notifications.length === 0}
              aria-label={t.notificationsClear}
              data-tooltip={t.notificationsClear}
              onClick={() => {
                onClear();
                // Clearing disables the button the pointer or the keyboard was
                // just on. Without this the focus falls to `<body>` and Tab
                // restarts from the top of the document instead of continuing
                // inside the panel that is still open.
                popupRef.current?.focus();
              }}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </header>

          {notifications.length === 0 ? (
            <div className="notification-center__empty">
              <p className="notification-center__empty-title">
                {isEnabled ? t.notificationsEmptyTitle : t.notificationsDisabledTitle}
              </p>
              <p className="notification-center__empty-description">
                {isEnabled ? t.notificationsEmptyDescription : t.notificationsDisabledDescription}
              </p>
              {!isEnabled && settingsButton}
            </div>
          ) : (
            <>
              {/* A list that already has entries still has to say when it has
                  stopped growing, or a turned-off centre looks like a quiet
                  one — and it needs the same way back to the switch that the
                  empty state offers, or the reader is told about a setting with
                  no route to it. */}
              {!isEnabled && (
                <div className="notification-center__disabled-note">
                  <p>{t.notificationsDisabledTitle}</p>
                  {settingsButton}
                </div>
              )}
              <ul
                {...autoHideScrollbarProps<HTMLUListElement>()}
                className="notification-center__list auto-hide-scrollbar"
                aria-label={t.notificationsListAriaLabel}
              >
                {notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    wasUnread={seenUnreadIds.has(notification.id)}
                    now={openedAt}
                    formats={formats}
                    t={t}
                    onAction={(entry) => {
                      close(false);
                      onReviewTeamChanges(entry);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
