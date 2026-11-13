import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

/**
 * Runs the real website script (public/widget.js) against sample forms,
 * the way a visitor's browser would.
 */
const SOURCE = readFileSync(join(process.cwd(), "public/widget.js"), "utf8");
const PORTAL = "https://portal.example";

type Sent = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string; keepalive?: boolean } };

async function load(
  html: string,
  opts: { config?: Record<string, unknown>; script?: string } = {},
) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: "https://www.acme-plumbing.com/contact",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const sent: Sent[] = [];
  const configRequests: string[] = [];
  const config = opts.config ?? { enabled: false, capture: true, site_key: "abc" };
  (window as unknown as { fetch: unknown }).fetch = (url: string, init?: Sent["init"]) => {
    if (url.includes("/api/public/chat/config")) {
      configRequests.push(url);
      return Promise.resolve({ json: () => Promise.resolve(config) });
    }
    sent.push({ url, init: init ?? {} });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  };

  const tag = window.document.createElement("script");
  tag.setAttribute("src", opts.script ?? `${PORTAL}/widget.js`);
  if (!opts.script) tag.setAttribute("data-site-key", "abc");
  Object.defineProperty(window.document, "currentScript", { configurable: true, get: () => tag });
  window.eval(SOURCE);
  // Let the config request settle so capture is switched on.
  await new Promise((resolve) => setTimeout(resolve, 0));

  function submit(selector = "form") {
    const form = window.document.querySelector(selector)!;
    const event = new window.Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    return event;
  }
  const leads = () => sent.map((s) => JSON.parse(s.init.body ?? "{}") as Record<string, string>);
  return { window, sent, leads, submit, configRequests };
}

const CONTACT = `
  <form id="contact-form" action="/contact">
    <label for="n">Full name</label><input id="n" name="fullname" value="Jo Smith">
    <label for="p">Phone</label><input id="p" type="tel" name="phone" value="(405) 555-0142">
    <label for="e">Email</label><input id="e" type="email" name="email" value="jo@example.com">
    <label for="m">How can we help?</label><textarea id="m" name="details">Need a deep clean on Friday</textarea>
    <input type="hidden" name="csrf" value="secret-token">
    <select name="service"><option selected>Deep clean</option></select>
    <button type="submit">Send</button>
  </form>`;

describe("website script: form capture", () => {
  it("sends name, phone, email and message, and nothing else from the form", async () => {
    const page = await load(CONTACT);
    const event = page.submit();

    expect(page.sent).toHaveLength(1);
    expect(page.sent[0].url).toBe(`${PORTAL}/api/public/capture`);
    expect(page.sent[0].init).toMatchObject({
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
    expect(page.leads()[0]).toEqual({
      name: "Jo Smith",
      phone: "(405) 555-0142",
      email: "jo@example.com",
      message: "Need a deep clean on Friday",
      form_label: "contact-form",
      consent_text: "",
      site_key: "abc",
      page_url: "https://www.acme-plumbing.com/contact",
    });
    expect(page.sent[0].init.body).not.toContain("secret-token");
    // The form's own submission is never stopped.
    expect(event.defaultPrevented).toBe(false);
  });

  it("joins first and last name, and reads fields labelled only by placeholder", async () => {
    const page = await load(`
      <form>
        <input name="fname" placeholder="First name" value="Jo">
        <input name="lname" placeholder="Last name" value="Smith">
        <input name="contact" placeholder="Mobile number" value="405-555-0142">
        <button>Send</button>
      </form>`);
    page.submit();
    expect(page.leads()[0]).toMatchObject({ name: "Jo Smith", phone: "405-555-0142", message: "" });
  });

  it("keeps the SMS consent wording shown with the form", async () => {
    const page = await load(`
      <div>
        <form>
          <input name="name" value="Jo"><input type="tel" name="phone" value="4055550142">
          <button>Send</button>
        </form>
        <p>By submitting, you agree to receive text messages from Acme about your request. Reply STOP to opt out.</p>
      </div>`);
    page.submit();
    expect(page.leads()[0].consent_text).toContain("agree to receive text messages from Acme");
  });

  it.each([
    ["a login form", `<form><input name="email" value="jo@example.com"><input type="password" name="pw" value="x"><button>Log in</button></form>`],
    ["a form with a card number", `<form><input name="name" value="Jo"><input type="tel" name="phone" value="4055550142"><input name="card_number" value="4242"><button>Pay</button></form>`],
    ["a form with a card autocomplete hint", `<form><input name="name" value="Jo"><input type="tel" name="phone" value="4055550142"><input name="x" autocomplete="cc-number"><button>Pay</button></form>`],
    ["a checkout form", `<form action="/checkout"><input name="name" value="Jo"><input type="tel" name="phone" value="4055550142"><button>Buy</button></form>`],
    ["a sign-up form", `<form id="signup-form"><input name="name" value="Jo"><input type="tel" name="phone" value="4055550142"><button>Join</button></form>`],
    ["a search form", `<form role="search"><input name="q" value="4055550142 plumber"><button>Search</button></form>`],
    ["a GET form", `<form method="get"><input name="name" value="Jo"><input type="tel" name="phone" value="4055550142"><button>Go</button></form>`],
    ["a newsletter form (email only)", `<form><input type="email" name="email" value="jo@example.com"><button>Subscribe</button></form>`],
    ["a form marked to be ignored", `<form data-sitewyre-ignore><input name="name" value="Jo"><input type="tel" name="phone" value="4055550142"><button>Send</button></form>`],
    ["a form the browser would reject", `<form><input name="name" required value=""><input type="tel" name="phone" value="4055550142"><button>Send</button></form>`],
    ["a form whose bot trap was filled", `<form><input name="name" value="Jo"><input type="tel" name="phone" value="4055550142"><div aria-hidden="true"><input name="website" value="http://spam.example"></div><button>Send</button></form>`],
    ["a phone number with no area code and no email", `<form><input name="name" value="Jo"><input type="tel" name="phone" value="555-0142"><button>Send</button></form>`],
  ])("skips %s", async (_label, html) => {
    const page = await load(html);
    page.submit();
    expect(page.sent).toHaveLength(0);
  });

  it("takes an email-only enquiry when there's a message", async () => {
    const page = await load(`
      <form>
        <input type="email" name="email" value="jo@example.com">
        <textarea name="message">Do you clean offices?</textarea>
        <button>Send</button>
      </form>`);
    page.submit();
    expect(page.leads()[0]).toMatchObject({ phone: "", email: "jo@example.com", message: "Do you clean offices?" });
  });

  it("sends a double click only once", async () => {
    const page = await load(CONTACT);
    page.submit();
    page.submit();
    expect(page.sent).toHaveLength(1);
  });

  it("does nothing when the business hasn't turned form capture on", async () => {
    const page = await load(CONTACT, { config: { enabled: false, capture: false, site_key: "abc" } });
    page.submit();
    expect(page.sent).toHaveLength(0);
  });

  it("reads the site key from the script address, for tools that drop data- attributes", async () => {
    const page = await load(CONTACT, { script: `${PORTAL}/widget.js?site=xyz`, config: { enabled: false, capture: true } });
    expect(page.configRequests[0]).toContain("site_key=xyz");
    page.submit();
    expect(page.leads()[0].site_key).toBe("xyz");
  });
});

describe("website script: embeds", () => {
  it("turns placeholders into the booking calendar and lead form frames", async () => {
    const page = await load(
      `<div id="b" data-sitewyre="booking"></div><div id="l" data-sitewyre="lead-form"></div><div data-sitewyre="unknown"></div>`,
      { config: { enabled: false, capture: false, site_key: "abc" } },
    );
    const frames = page.window.document.querySelectorAll("iframe");
    expect(frames).toHaveLength(2);
    expect(page.window.document.querySelector("#b iframe")?.getAttribute("src")).toBe(`${PORTAL}/embed/book/abc`);
    expect(page.window.document.querySelector("#l iframe")?.getAttribute("src")).toBe(`${PORTAL}/embed/lead/abc`);
    expect(page.window.document.querySelector("#b iframe")?.getAttribute("title")).toBe("Book online");
  });

  it("sizes a Sitewyre frame to the height it reports, and ignores messages from anywhere else", async () => {
    const page = await load(`<div data-sitewyre="booking"></div>`, {
      config: { enabled: false, capture: false, site_key: "abc" },
    });
    const frame = page.window.document.querySelector("iframe") as HTMLIFrameElement;
    const post = (origin: string, data: unknown) =>
      page.window.dispatchEvent(
        new page.window.MessageEvent("message", { origin, data, source: frame.contentWindow }),
      );

    post("https://evil.example", { type: "sitewyre:height", height: 900 });
    expect(frame.style.height).toBe("760px");
    post(PORTAL, { type: "something-else", height: 900 });
    expect(frame.style.height).toBe("760px");
    post(PORTAL, { type: "sitewyre:height", height: 912.4 });
    expect(frame.style.height).toBe("912px");
    post(PORTAL, { type: "sitewyre:height", height: 999999 });
    expect(frame.style.height).toBe("4000px");
  });
});
