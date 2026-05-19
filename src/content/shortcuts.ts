export type ShortcutHandlers = {
  setA: () => void;
  setB: () => void;
  save: () => void;
  stop: () => void;
  isPhraseLoopLabelInput: (target: EventTarget | null) => boolean;
};

export function registerShortcuts(handlers: ShortcutHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (handlers.isPhraseLoopLabelInput(event.target)) {
      if (event.key === "Enter") {
        event.preventDefault();
        handlers.save();
      }
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    if (event.key === "[") {
      event.preventDefault();
      handlers.setA();
    } else if (event.key === "]") {
      event.preventDefault();
      handlers.setB();
    } else if (event.key === "\\") {
      event.preventDefault();
      handlers.save();
    } else if (event.key === "Escape") {
      handlers.stop();
    }
  };

  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();

  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    !!target.closest("[contenteditable='true']")
  );
}
