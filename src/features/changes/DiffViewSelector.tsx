import { Columns2, FileText, Rows3, BookOpen } from "lucide-react";

import type { Translations } from "../../i18n";
import { DiffOptionPicker } from "./DiffOptionPicker";
import type { DiffViewMode } from "./DiffResultView";

const VIEW_MODE_ICONS: Record<DiffViewMode, React.JSX.Element> = {
  unified: <Rows3 aria-hidden="true" />,
  split: <Columns2 aria-hidden="true" />,
  accessible: <FileText aria-hidden="true" />,
};

const VIEW_MODE_LABEL_KEYS = {
  unified: "changesViewUnified",
  split: "changesViewSplit",
  accessible: "changesViewAccessible",
} as const satisfies Record<DiffViewMode, keyof Translations>;

const VIEW_MODES: DiffViewMode[] = ["unified", "split", "accessible"];

/** Shared picker for every surface that renders the Changes diff language. */
export function DiffViewSelector({
  value,
  onChange,
  t,
  markdown,
}: {
  value: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
  t: Translations;
  markdown?: { selected: boolean; onSelect: () => void };
}): React.JSX.Element {
  return (
    <DiffOptionPicker
      value={markdown?.selected ? "markdown" : value}
      ariaLabel={t.changesViewAriaLabel}
      onChange={(mode) => {
        if (mode === "markdown") markdown?.onSelect();
        else onChange(mode);
      }}
      options={[...VIEW_MODES.map((mode) => ({
        value: mode,
        label: t[VIEW_MODE_LABEL_KEYS[mode]],
        icon: VIEW_MODE_ICONS[mode],
      })), ...(markdown ? [{ value: "markdown" as const, label: t.changesMarkdownPreview, icon: <BookOpen aria-hidden="true" /> }] : [])]}
    />
  );
}
