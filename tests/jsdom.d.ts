// jsdom ships no type declarations and is only used by tests that run the
// website script against sample pages.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string; runScripts?: "dangerously" | "outside-only" });
    readonly window: Window & typeof globalThis & { eval(code: string): unknown };
  }
}
