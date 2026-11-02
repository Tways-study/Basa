// Only what is used, so a test can pass a small fake and the real window still fits.
export interface PrintWindow {
  print(): void;
  addEventListener(type: "beforeprint", listener: () => void): void;
  removeEventListener(type: "beforeprint", listener: () => void): void;
}

/**
 * Calls window.print() and says whether a print dialog really started. Some mobile browsers, such as the
 * in-app browsers inside social apps, have a print() that does nothing and gives no error, so a person
 * taps the button and sees nothing. "beforeprint" fires when a dialog is about to open, so no event within
 * `waitMs` means the screen should tell the person what to do instead.
 */
export function printWithCheck(win: PrintWindow, waitMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let started = false;
    const onStart = () => {
      started = true;
    };
    win.addEventListener("beforeprint", onStart);
    try {
      win.print();
    } catch (err) {
      console.error("print failed:", err instanceof Error ? err.name : "unknown error");
      win.removeEventListener("beforeprint", onStart);
      resolve(false);
      return;
    }
    setTimeout(() => {
      win.removeEventListener("beforeprint", onStart);
      resolve(started);
    }, waitMs);
  });
}
