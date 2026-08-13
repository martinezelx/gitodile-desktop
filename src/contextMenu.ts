export async function copyTextToClipboard(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (text.length === 0) return false;
  if (clipboard) {
    await clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy command was rejected");
    return true;
  } finally {
    textarea.remove();
  }
}
