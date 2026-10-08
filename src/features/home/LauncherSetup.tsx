import React, { useId } from "react";
import {
  Check,
  CloudDownload,
  CornerDownLeft,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  TriangleAlert,
  UserRound,
  Wrench,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { GitIcon, HostingProviderIcon, TextPlaceholder } from "../../shared/ui";
import type { HostedRepository } from "../repository-browser";
import {
  ACCOUNT_KIND_NAMES,
  groupAccountsByKind,
  matchRecentProjects,
  nextSetupStep,
  shortGitVersion,
  accountChoiceParts,
  ACCOUNT_CHOICES_AS_BUTTONS,
  type HomeAccount,
  type HomeAccountKind,
  type HomeSetup,
  type SetupPlan,
} from "./launcher";

/**
 * The parts of Home that are about this computer rather than a project. All
 * of them live inside the launcher card, so the screen stays a greeting and
 * one object: the first-run steps fill the results area that has nothing else
 * to show yet, a missing Git sits above the results it would break, and the
 * card's own foot says what the machine is set up with.
 */

/** First run: three steps in the space recent projects will take later. The
 * next one is the screen's single accent while it is required; the account
 * is optional and never takes it. */
export function SetupSteps({
  setup,
  plan,
  onConfigureIdentity,
  onConnectAccount,
  onOpenGitSettings,
  onHide,
}: {
  setup: HomeSetup;
  plan: SetupPlan;
  onConfigureIdentity: () => void;
  /** Git could not be checked: Settings says why and can install it. */
  onOpenGitSettings: () => void;
  onConnectAccount: () => void;
  onHide: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const titleId = useId();
  const next = nextSetupStep(plan);
  const done = plan.steps.filter((step) => step.done).length;
  const total = plan.steps.length;
  const login = setup.accounts?.[0]?.login ?? "";

  return (
    <section className="home-setup" aria-labelledby={titleId}>
      <div className="home-setup__header">
        <h2 className="home-launcher__section-title home-setup__title" id={titleId}>
          {t.homeSetupTitle}
        </h2>
        <span className="home-setup__progress">{t.homeSetupProgress(done, total)}</span>
        <span className="home-setup__bar" aria-hidden="true">
          <span style={{ width: `${(done / total) * 100}%` }} />
        </span>
        <button type="button" className="home-setup__hide" onClick={onHide}>
          {t.homeSetupHide}
        </button>
      </div>
      <ol className="home-setup__steps">
        {plan.steps.map((step) => {
          const isNext = step.id === next?.id;
          const isAccent = isNext && !step.optional;
          const glyph = step.done ? <Check /> : step.id === "identity" ? <UserRound /> : step.id === "account" ? <Link2 /> : <Wrench />;
          const title = step.done
            ? step.id === "git"
              ? t.homeSetupGitDone(shortGitVersion(setup.git.version ?? ""))
              : step.id === "identity"
                ? t.homeSetupIdentityDone(setup.identity?.name ?? "")
                : t.homeSetupAccountDone(login)
            : step.id === "git"
              ? t.homeSetupGitTitle
              : step.id === "identity"
                ? t.homeSetupIdentityTitle
                : t.homeSetupAccountTitle;
          const hint = step.done ? null : step.id === "identity" ? t.homeSetupIdentityHint : step.id === "account" ? t.homeSetupAccountHint : null;
          const action = step.done
            ? null
            : step.id === "git"
              ? { label: t.homeGitOpenSettings, run: onOpenGitSettings }
              : step.id === "identity"
                ? { label: t.homeSetupIdentityAction, run: onConfigureIdentity }
                : { label: t.homeSetupAccountAction, run: onConnectAccount };
          return (
            <li
              key={step.id}
              className={`home-setup__step${step.done ? " home-setup__step--done" : ""}${isNext ? " home-setup__step--next" : ""}`}
            >
              <span
                className={`home-setup__glyph${step.done ? " home-setup__glyph--done" : ""}${isAccent ? " home-setup__glyph--now attention-breathe" : ""}`}
                aria-hidden="true"
              >
                {glyph}
              </span>
              <span className="home-launcher__copy">
                <span className="home-launcher__name home-setup__name">
                  {title}
                  {step.optional && !step.done && <span className="home-setup__optional">{t.homeSetupOptional}</span>}
                </span>
                {hint && <span className="home-setup__hint">{hint}</span>}
              </span>
              {action && (
                <button
                  type="button"
                  data-launcher-item
                  className={isAccent ? "primary-button primary-button--sm home-setup__action" : "secondary-button secondary-button--sm home-setup__action"}
                  onClick={action.run}
                >
                  {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Git is missing or will not run. The one thing on Home that blocks work, so
 * it takes the accent and sits above the results it would break. Installing
 * happens where it already does, in Settings; checking again is explicit. */
export function GitNotice({
  state,
  isRechecking,
  onInstallGit,
  onRecheckGit,
}: {
  state: "missing" | "unusable";
  isRechecking: boolean;
  onInstallGit: () => void;
  onRecheckGit: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <div className="home-git-notice" role="status">
      <span className="home-git-notice__glyph" aria-hidden="true">
        <TriangleAlert />
      </span>
      <span className="home-launcher__copy">
        <span className="home-git-notice__title">{state === "missing" ? t.homeGitMissingTitle : t.homeGitUnusableTitle}</span>
        <span className="home-git-notice__hint">{state === "missing" ? t.homeGitMissingHint : t.homeGitUnusableHint}</span>
      </span>
      <button type="button" className="primary-button primary-button--sm home-git-notice__action" onClick={onInstallGit}>
        {state === "missing" ? t.homeGitInstall : t.homeGitOpenSettings}
      </button>
      <button
        type="button"
        className="secondary-button secondary-button--sm home-git-notice__action"
        disabled={isRechecking}
        onClick={onRecheckGit}
      >
        {isRechecking ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        {isRechecking ? t.homeGitChecking : t.homeGitCheckAgain}
      </button>
    </div>
  );
}

/** The card's foot: what this computer is set up with, each part a way into
 * its own Settings section. Only the name shows, never the email — the line
 * is on screen whenever Home is, including while sharing it. */
export function SetupStatus({
  setup,
  plan,
  onOpenGitSettings,
  onConfigureIdentity,
  onOpenAccount,
  onConnectAccount,
  showAccounts = true,
}: {
  setup: HomeSetup;
  plan: SetupPlan;
  /** False when the launcher already shows each provider as a tab: the same
   * accounts are not listed twice. */
  showAccounts?: boolean;
  onOpenGitSettings: () => void;
  onConfigureIdentity: () => void;
  onOpenAccount: (kind: HomeAccountKind) => void;
  onConnectAccount: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const accounts = setup.accounts ?? [];
  const pendingKinds = (setup.pendingAccountKinds ?? []).filter(
    (kind) => !showAccounts || !accounts.some((account) => account.kind === kind),
  );
  const isReading =
    setup.git.state === "checking" || setup.identity === null || setup.accounts === null || pendingKinds.length > 0;
  return (
    <div className="home-status" role="group" aria-label={t.homeStatusLabel} aria-busy={isReading}>
      {/* Git's own mark names it, as in Settings; the version is the fact.
          A missing Git is already said, louder, above the results. */}
      {setup.git.state === "available" && setup.git.version && (
        <button
          type="button"
          className="home-status__item"
          aria-label={t.homeStatusGit(shortGitVersion(setup.git.version))}
          data-tooltip={t.homeStatusGit(setup.git.version)}
          onClick={onOpenGitSettings}
        >
          <span className="home-status__mark" aria-hidden="true">
            <GitIcon />
          </span>
          <span aria-hidden="true">{shortGitVersion(setup.git.version)}</span>
        </button>
      )}
      {setup.git.state === "checking" && <StatusPlaceholder width={30} />}
      {setup.identity === null && <StatusPlaceholder width={96} />}
      {setup.identity &&
        (plan.identityMissing ? (
          <button type="button" className="home-status__item home-status__item--warn" onClick={onConfigureIdentity}>
            <TriangleAlert aria-hidden="true" />
            {t.homeStatusIdentityMissing}
          </button>
        ) : (
          <button
            type="button"
            className="home-status__item"
            aria-label={t.homeSetupIdentityDone(setup.identity.name)}
            data-tooltip={t.homeSetupIdentityDone(setup.identity.name)}
            onClick={onConfigureIdentity}
          >
            <UserRound aria-hidden="true" />
            <span aria-hidden="true">{setup.identity.name}</span>
          </button>
        ))}
      {/* One entry per provider: an account and a token on the same host are
          one fact here ("2 accounts"), and Settings lists them apart. */}
      {groupAccountsByKind(showAccounts ? accounts : []).map((group) => {
        const provider = ACCOUNT_KIND_NAMES[group.kind];
        const single = group.accounts.length === 1 ? group.accounts[0] : null;
        return (
          <button
            key={group.kind}
            type="button"
            className="home-status__item"
            aria-label={
              single
                ? t.homeStatusAccount(provider, single.login)
                : t.homeStatusAccountGroup(provider, group.accounts.map((account) => account.login).join(", "))
            }
            data-tooltip={single ? undefined : group.accounts.map((account) => account.login).join(", ")}
            onClick={() => onOpenAccount(group.kind)}
          >
            <span className="home-status__mark" aria-hidden="true">
              <HostingProviderIcon provider={group.kind} />
            </span>
            <span aria-hidden="true">{single ? single.login : t.homeStatusAccounts(group.accounts.length)}</span>
          </button>
        );
      })}
      {/* Saved connections are still being checked (ADR 0027): hold their
          place rather than say "none" and then jump. */}
      {setup.accounts === null && <StatusPlaceholder width={72} />}
      {/* One place per provider still being checked, when the line lists
          accounts; with tabs, the tab row holds them instead. */}
      {showAccounts && pendingKinds.map((kind) => <StatusPlaceholder key={kind} width={72} />)}
      {/* With an account already there, connecting another is a small "+":
          rarely wanted, and the line has the least room for it. It waits for
          the check, so it never changes from text to "+" under the reader. */}
      {setup.accounts &&
        pendingKinds.length === 0 &&
        (accounts.length > 0 ? (
          <button
            type="button"
            className="home-status__item home-status__item--connect home-status__item--icon"
            aria-label={t.homeStatusConnectAnother}
            data-tooltip={t.homeStatusConnectAnother}
            onClick={onConnectAccount}
          >
            <Plus aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="home-status__item home-status__item--connect" onClick={onConnectAccount}>
            <Link2 aria-hidden="true" />
            {t.homeStatusConnect}
          </button>
        ))}
    </div>
  );
}

/** A status entry that has not been read yet: its mark and its text, drawn
 * where they will land. Like every first-load shape it stays invisible for
 * the first 320ms, so a quick answer never flickers. */
function StatusPlaceholder({ width }: { width: number }): React.JSX.Element {
  return (
    <span className="home-status__item home-status__item--placeholder loading-placeholder" aria-hidden="true">
      <TextPlaceholder className="text-placeholder--glyph" />
      <TextPlaceholder width={width} />
    </span>
  );
}

/** The first-run steps' shape while their answers are still coming. */
export function SetupStepsPlaceholder(): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <div className="home-setup loading-placeholder" role="status" aria-busy="true">
      <span className="visually-hidden">{t.homeSetupTitle}</span>
      <div className="home-setup__header">
        <TextPlaceholder width={110} />
      </div>
      <ol className="home-setup__steps">
        {[150, 190, 230].map((width) => (
          <li key={width} className="home-setup__step">
            <span className="home-setup__glyph" aria-hidden="true" />
            <span className="home-launcher__copy">
              <TextPlaceholder width={width} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const ACCOUNT_ROWS_SHOWN = 6;

/** One connected account's projects, as the launcher lists them under its
 * tab: read only when the tab is chosen, filtered by what is typed, and
 * cloned through the Clone dialog filled in — never from here. */
export function AccountResults({
  account,
  siblings,
  onChooseAccount,
  repositories,
  hasMore,
  isPending,
  hasError,
  query,
  isDisabled,
  onRetry,
  onClone,
  onBrowseAll,
}: {
  account: HomeAccount;
  /** Every account on this provider; more than one adds a chooser. */
  siblings: readonly HomeAccount[];
  onChooseAccount: (accountId: string) => void;
  repositories: readonly HostedRepository[] | null;
  hasMore: boolean;
  isPending: boolean;
  hasError: boolean;
  query: string;
  isDisabled: boolean;
  onRetry: () => void;
  onClone: (url: string) => void;
  onBrowseAll: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const titleId = useId();
  const provider = ACCOUNT_KIND_NAMES[account.kind];
  const matches = repositories
    ? matchRecentProjects(
        repositories.map((repository) => ({ ...repository, path: repository.fullName })),
        query,
      )
    : [];
  const shown = matches.slice(0, ACCOUNT_ROWS_SHOWN);

  return (
    <section className="home-launcher__section" aria-labelledby={titleId} aria-busy={isPending}>
      <div className="home-launcher__account-head">
        {/* With a chooser beside it, the heading leaves the login to the
            chooser rather than saying it twice. */}
        <h2 className="home-launcher__section-title" id={titleId}>
          {siblings.length > 1 ? t.homeAccountSectionAll(provider) : t.homeAccountSection(provider, account.login)}
        </h2>
        {siblings.length > 1 && siblings.length <= ACCOUNT_CHOICES_AS_BUTTONS && (
          <div className="home-launcher__account-chooser" role="group" aria-label={t.homeAccountChooser(provider)}>
            {siblings.map((sibling) => (
              <button
                key={sibling.id}
                type="button"
                className="home-launcher__account-choice"
                aria-pressed={sibling.id === account.id}
                onClick={() => onChooseAccount(sibling.id)}
              >
                {accountChoiceLabel(sibling, siblings, t)}
              </button>
            ))}
          </div>
        )}
        {siblings.length > ACCOUNT_CHOICES_AS_BUTTONS && (
          <select
            className="home-launcher__account-select"
            aria-label={t.homeAccountChooser(provider)}
            value={account.id}
            onChange={(event) => onChooseAccount(event.target.value)}
          >
            {siblings.map((sibling) => (
              <option key={sibling.id} value={sibling.id}>
                {accountChoiceLabel(sibling, siblings, t)}
              </option>
            ))}
          </select>
        )}
      </div>
      {isPending && !repositories && (
        <p className="home-launcher__note home-launcher__note--plain">
          <LoaderCircle className="icon--spinning" aria-hidden="true" />
          {t.homeAccountLoading}
        </p>
      )}
      {hasError && !isPending && (
        <p className="home-launcher__note home-launcher__note--plain">
          {t.homeAccountError}
          <button type="button" className="home-launcher__inline-action" onClick={onRetry}>
            {t.homeAccountRetry}
          </button>
        </p>
      )}
      {repositories && repositories.length === 0 && (
        <p className="home-launcher__note home-launcher__note--plain">{t.homeAccountEmpty}</p>
      )}
      {repositories && repositories.length > 0 && shown.length === 0 && (
        <p className="home-launcher__note home-launcher__note--plain">{t.homeAccountNoMatches(query.trim())}</p>
      )}
      {shown.length > 0 && (
        <ul className="home-launcher__list">
          {shown.map((repository, index) => (
            <RepositoryRow
              key={repository.id}
              repository={repository}
              isPrimary={index === 0}
              isDisabled={isDisabled}
              onClone={onClone}
            />
          ))}
        </ul>
      )}
      {(hasMore || matches.length > shown.length) && (
        <button type="button" className="home-launcher__more" data-launcher-item onClick={onBrowseAll}>
          {t.homeAccountMore}
        </button>
      )}
    </section>
  );
}

/** "martinezelx · Token", "luis · git.acme.dev": only as much as it takes to
 * tell this account from the others on the same provider. */
function accountChoiceLabel(
  account: HomeAccount,
  siblings: readonly HomeAccount[],
  t: ReturnType<typeof useLanguage>["t"],
): string {
  const parts = accountChoiceParts(account, siblings);
  return [
    parts.login,
    parts.showSource ? (account.source === "token" ? t.homeAccountSourceToken : t.homeAccountSourceConnection) : null,
    parts.server,
  ]
    .filter(Boolean)
    .join(" · ");
}

function RepositoryRow({
  repository,
  isPrimary,
  isDisabled,
  onClone,
}: {
  repository: HostedRepository;
  isPrimary: boolean;
  isDisabled: boolean;
  onClone: (url: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const nameId = useId();
  const detailId = useId();
  const detail = [
    repository.private ? t.homeRepoPrivate : t.homeRepoPublic,
    repository.archived ? t.homeRepoArchived : null,
    repository.description,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={`home-launcher__item${isPrimary ? " home-launcher__item--primary" : ""}`}>
      <button
        className="home-launcher__open"
        type="button"
        data-launcher-item
        disabled={isDisabled}
        aria-labelledby={nameId}
        aria-describedby={detailId}
        onClick={() => onClone(repository.cloneUrl)}
      >
        <span className="home-launcher__glyph" aria-hidden="true">
          <CloudDownload />
        </span>
        <span className="home-launcher__copy">
          <span className="home-launcher__name" id={nameId}>
            {repository.fullName}
          </span>
          <span className="home-launcher__path" id={detailId}>
            {detail}
          </span>
        </span>
        {isPrimary && (
          <span className="home-launcher__enter" aria-hidden="true">
            <CornerDownLeft />
            {t.homeActionClone}
          </span>
        )}
      </button>
    </li>
  );
}
