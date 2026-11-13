/**
 * The code a client pastes into their own website, and where to paste it
 * on each website builder. Checked against each builder's help pages in
 * November 2026; menu names change, so each guide says what to look for.
 */

export function websiteSnippet(appUrl: string, siteKey: string): string {
  return `<script src="${appUrl}/widget.js" data-site-key="${siteKey}" async></script>`;
}

/** Google Tag Manager drops data- attributes from script tags, so this
 * version carries the site key in the address and adds the tag itself. */
export function gtmSnippet(appUrl: string, siteKey: string): string {
  return [
    "<script>",
    "(function () {",
    '  var s = document.createElement("script");',
    `  s.src = "${appUrl}/widget.js?site=${siteKey}";`,
    "  s.async = true;",
    "  document.body.appendChild(s);",
    "})();",
    "</script>",
  ].join("\n");
}

export type InstallGuide = {
  id: string;
  name: string;
  /** Which code this builder needs. */
  uses: "snippet" | "gtm" | "embeds";
  steps: string[];
  notes: string[];
};

export const INSTALL_GUIDES: InstallGuide[] = [
  {
    id: "wordpress",
    name: "WordPress",
    uses: "snippet",
    steps: [
      "In your WordPress admin, go to Plugins > Add New and install the free WPCode plugin, then activate it.",
      "Go to Code Snippets > Header & Footer.",
      "Paste the code into the Footer box.",
      "Click Save Changes.",
    ],
    notes: ["If your theme has its own box for footer scripts, pasting the code there works too."],
  },
  {
    id: "wix",
    name: "Wix",
    uses: "snippet",
    steps: [
      "In your site's dashboard, go to Settings, then Custom Code (under Development & integrations).",
      "Click + Add Custom Code and paste the code.",
      "Choose All pages, and place the code in Body - end.",
      "Click Apply.",
    ],
    notes: [
      "Wix only allows custom code on a site with its own connected domain.",
      "Wix builds its forms in its own way, so form capture may not pick them up. Send a test enquiry; if it doesn't appear in your leads, use the lead form below instead.",
    ],
  },
  {
    id: "squarespace",
    name: "Squarespace",
    uses: "snippet",
    steps: [
      "Open Settings and find Code Injection (under Advanced or Developer Tools).",
      "Paste the code into the Footer box.",
      "Click Save.",
    ],
    notes: ["Code Injection is only included in some Squarespace plans. If the box is greyed out, your plan doesn't include it: use the embed codes below on a page instead."],
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    uses: "embeds",
    steps: [
      "GoDaddy Websites + Marketing doesn't allow code that runs on every page, so the chat bubble and form capture can't be installed there.",
      "Use the booking calendar or lead form below instead: open the page in Edit Website, add a section, choose HTML, and paste the embed code into the Custom Code box.",
      "Publish your site.",
    ],
    notes: ["A GoDaddy site built on WordPress can use the WordPress steps."],
  },
  {
    id: "shopify",
    name: "Shopify",
    uses: "snippet",
    steps: [
      "In your Shopify admin, go to Online Store > Themes.",
      "On your current theme, open the ... menu and choose Edit code.",
      "Open layout > theme.liquid.",
      "Paste the code on its own line just above </body>, near the bottom of the file.",
      "Click Save.",
    ],
    notes: ["Checkout, cart, login and newsletter forms are never captured."],
  },
  {
    id: "webflow",
    name: "Webflow",
    uses: "snippet",
    steps: [
      "Open Site settings and go to the Custom code tab.",
      "Paste the code into the Footer code box.",
      "Click Save changes, then publish your site.",
    ],
    notes: ["Custom code needs a paid Webflow plan, and only shows on the published site."],
  },
  {
    id: "gtm",
    name: "Google Tag Manager",
    uses: "gtm",
    steps: [
      "In Tag Manager, go to Tags > New and choose Custom HTML.",
      "Paste the Tag Manager version of the code (it's different from the normal one).",
      "Set the trigger to All Pages.",
      "Save the tag, then Submit and publish the container.",
    ],
    notes: ["Use this only if Tag Manager is already on your website."],
  },
];

/** Frames a client can paste into any page. They work on their own; with
 * the script installed as well, each frame is sized to fit its content. */
export function embedSnippets(
  appUrl: string,
  siteKey: string,
): { id: string; title: string; description: string; code: string }[] {
  const frame = (path: string, title: string, height: number) =>
    `<iframe src="${appUrl}${path}${siteKey}" title="${title}" style="width:100%;max-width:560px;height:${height}px;border:0" loading="lazy"></iframe>`;
  return [
    {
      id: "booking",
      title: "Booking calendar",
      description: "Customers pick a service, a day and an open time from your real availability.",
      code: frame("/embed/book/", "Book online", 760),
    },
    {
      id: "lead-form",
      title: "Lead form",
      description: "Name, phone, email and message. It already shows the text message consent wording, so these leads can be texted.",
      code: frame("/embed/lead/", "Contact form", 620),
    },
  ];
}
