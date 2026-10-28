// What installing Flatpare looks like on this device (#190). Pure, so each
// state is testable without a browser; src/components/install reads the
// browser and passes the facts in.
//
// - installed: running as the installed app, so there is nothing to offer.
// - prompt: the browser handed us its install prompt (Chrome, Edge, Android).
// - ios: an iPhone or iPad, which never offers a prompt; installing is the
//   Share button, then "Add to Home Screen", so we explain that instead.
// - none: no way to install that we know of, so nothing is shown.
export type InstallState = "installed" | "prompt" | "ios" | "none";

export interface InstallFacts {
  standalone: boolean;
  canPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

export function isAppleTouchDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS asks for the desktop site and reports itself as a Mac; a Mac has
  // no touch screen.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function installState(facts: InstallFacts): InstallState {
  if (facts.standalone) return "installed";
  if (facts.canPrompt) return "prompt";
  if (isAppleTouchDevice(facts.userAgent, facts.maxTouchPoints)) return "ios";
  return "none";
}
