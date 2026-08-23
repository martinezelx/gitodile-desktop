import React, { useCallback, useMemo, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";

/** Messages currently shown, keyed by the field name given to `fieldProps`. */
export type FieldErrorMap = Readonly<Record<string, string>>;

/** One submit-time check. `message` is shown when `invalid` is true. */
export type FieldCheck = { field: string; invalid: boolean; message: string };

export type FieldErrorState = {
  errors: FieldErrorMap;
  /** Spread on the `<form>`: suppresses the browser bubble and clears a
   * message as soon as its own field is edited again. */
  formProps: {
    ref: React.RefObject<HTMLFormElement | null>;
    noValidate: true;
    onInput: React.FormEventHandler<HTMLFormElement>;
  };
  /** Spread on the control. `describedBy` keeps an existing help text linked. */
  fieldProps: (field: string, describedBy?: string) => {
    name: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  };
  /** Publishes the failing messages and focuses the first invalid control.
   * Returns true when every check passed. */
  validate: (checks: FieldCheck[]) => boolean;
  reset: () => void;
};

function fieldErrorId(field: string): string {
  return `${field}-error`;
}

/** Submit-time validation for dialog forms.
 *
 * The platform already validates `required`, but it does so through a native
 * bubble that ignores the app's theme, language, and reduced-motion settings,
 * and it vanishes on the next keystroke. This hook keeps `required` on the
 * control for assistive technology, turns the native UI off with `noValidate`,
 * and renders the message inline through `FieldError` instead.
 *
 * Field names must be plain slugs: they double as `[name="…"]` selectors when
 * focusing the first invalid control.
 */
export function useFieldErrors(): FieldErrorState {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrorMap>({});

  const onInput = useCallback<React.FormEventHandler<HTMLFormElement>>((event) => {
    const { name } = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!name) return;
    setErrors((current) => {
      if (current[name] === undefined) return current;
      const { [name]: _cleared, ...rest } = current;
      return rest;
    });
  }, []);

  const formProps = useMemo(
    () => ({ ref: formRef, noValidate: true as const, onInput }),
    [onInput],
  );

  const fieldProps = useCallback(
    (field: string, describedBy?: string) => {
      const described = [describedBy, errors[field] ? fieldErrorId(field) : null]
        .filter(Boolean)
        .join(" ");
      return {
        name: field,
        "aria-invalid": errors[field] ? (true as const) : undefined,
        "aria-describedby": described || undefined,
      };
    },
    [errors],
  );

  const validate = useCallback((checks: FieldCheck[]): boolean => {
    const failing = checks.filter((check) => check.invalid);
    setErrors(Object.fromEntries(failing.map((check) => [check.field, check.message])));
    const first = failing[0];
    if (!first) return true;
    formRef.current?.querySelector<HTMLElement>(`[name="${first.field}"]`)?.focus();
    return false;
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, formProps, fieldProps, validate, reset };
}

/** The inline message for one field, wired to `fieldProps`' `aria-describedby`. */
export function FieldError({
  field,
  errors,
}: {
  field: string;
  errors: FieldErrorMap;
}): React.JSX.Element | null {
  const message = errors[field];
  if (!message) return null;
  // A span, not a paragraph: every consumer renders this inside the field's
  // own `<label>`, which only admits phrasing content.
  return (
    <span className="field-error" id={fieldErrorId(field)} role="alert">
      <CircleAlert aria-hidden="true" />
      {message}
    </span>
  );
}
