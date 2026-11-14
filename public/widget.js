/*
 * Sitewyre website script.
 *
 * Install with one tag, just before </body>:
 *   <script src="https://<portal>/widget.js" data-site-key="..." async></script>
 * The site key can also go in the address (widget.js?site=...), for tools
 * such as Google Tag Manager that drop data- attributes. Without either,
 * the business is looked up by the page's domain.
 * Optional data-mobile-offset="66" lifts the chat bubble by that many
 * pixels on narrow screens, for sites with a bar fixed to the bottom.
 *
 * What it does, each switched on by the business in the portal:
 *  - Chat bubble.
 *  - Form capture: sends a copy of the site's own form submissions (name,
 *    phone, email and message only) to the portal as a lead. It never
 *    stops, delays or changes the form, and skips any form with a password
 *    or payment field, and login, sign-up, checkout and search forms.
 *    Add data-sitewyre-ignore to a form to leave it alone.
 *  - Embeds: <div data-sitewyre="booking"></div> becomes the booking
 *    calendar and <div data-sitewyre="lead-form"></div> the lead form.
 *    Sitewyre frames pasted in by hand are sized to fit their content.
 *
 * No Turnstile (bot check) here: this script runs on other people's
 * websites, where Sitewyre's Turnstile widget can't. The portal checks
 * the request's origin, limits each visitor, and uses hidden trap fields.
 *
 * Plain JavaScript, no dependencies. The chat is drawn inside a shadow
 * root so the host site's styles can't affect it and its styles can't leak
 * out. All text is written with textContent, never innerHTML.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || window.__sitewyreChatLoaded) return;
  var scriptUrl = new URL(script.src, window.location.href);
  var siteKey = script.getAttribute("data-site-key") || scriptUrl.searchParams.get("site");
  window.__sitewyreChatLoaded = true;

  var apiBase = scriptUrl.origin;
  var storageKey = "sitewyre-chat-" + (siteKey || window.location.hostname);
  var DEFAULT_COLOR = "#b4693c";
  var MAX_LENGTH = 500;

  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(storageKey);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed.token === "string" && Array.isArray(parsed.messages)) return parsed;
    } catch {
      /* storage unavailable (private window, blocked) — start fresh */
    }
    return { token: null, messages: [] };
  }

  function saveState(state) {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* fine — the chat just won't survive a page change */
    }
  }

  function post(path, body) {
    return fetch(apiBase + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
          return data;
        });
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Reply text with https links made clickable — built node by node. */
  function appendLinkified(parent, text) {
    var pattern = /https:\/\/[^\s<>"']+/g;
    var last = 0;
    var match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      var url = match[0].replace(/[.,;:!?)]+$/, "");
      var link = el("a", null, url);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.appendChild(link);
      last = match.index + url.length;
      pattern.lastIndex = last;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  var STYLES =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".bubble{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:56px;height:56px;border:0;border-radius:50%;background:var(--sw-color);color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}" +
    ".bubble:focus-visible,.send:focus-visible,.close:focus-visible,.start:focus-visible{outline:3px solid rgba(0,0,0,.35);outline-offset:2px}" +
    ".bubble svg{width:26px;height:26px;fill:#fff}" +
    ".panel{position:fixed;right:16px;bottom:84px;z-index:2147483000;width:min(360px,calc(100vw - 24px));height:min(520px,calc(100vh - 110px));background:#fff;color:#1f2933;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-size:14px;line-height:1.45}" +
    ".panel.open{display:flex}" +
    ".head{background:var(--sw-color);color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px}" +
    ".head h2{margin:0;font-size:15px;font-weight:600}" +
    ".close{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}" +
    ".body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".intro{margin:0 0 4px;color:#52606d}" +
    "label{display:block;font-size:12px;font-weight:600;color:#3e4c59;margin-bottom:3px}" +
    "input,textarea{width:100%;border:1px solid #cbd2d9;border-radius:8px;padding:9px 10px;font-size:14px;color:#1f2933;background:#fff}" +
    "input:focus,textarea:focus{outline:2px solid var(--sw-color);outline-offset:1px;border-color:transparent}" +
    "textarea{resize:none}" +
    ".field{margin-bottom:8px}" +
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    ".consent{font-size:11px;color:#616e7c;margin:2px 0 8px}" +
    ".start,.send{background:var(--sw-color);color:#fff;border:0;border-radius:8px;padding:10px 14px;font-size:14px;font-weight:600;cursor:pointer}" +
    ".start{width:100%}" +
    ".start:disabled,.send:disabled{opacity:.55;cursor:default}" +
    ".msg{max-width:85%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".msg.visitor{align-self:flex-end;background:var(--sw-color);color:#fff;border-bottom-right-radius:4px}" +
    ".msg.assistant{align-self:flex-start;background:#f0f2f5;color:#1f2933;border-bottom-left-radius:4px}" +
    ".msg a{color:inherit;text-decoration:underline}" +
    ".typing{align-self:flex-start;color:#7b8794;font-size:13px;padding:2px 4px}" +
    ".error{color:#b42318;font-size:12px;margin:4px 0 0}" +
    ".foot{border-top:1px solid #e4e7eb;padding:10px;display:flex;gap:8px;align-items:flex-end}" +
    ".foot textarea{flex:1;height:40px;max-height:96px}" +
    ".note{font-size:11px;color:#7b8794;text-align:center;padding:0 10px 8px}" +
    "@media (max-width:860px){.bubble{bottom:calc(16px + var(--sw-mobile-offset,0px))}.panel{bottom:calc(84px + var(--sw-mobile-offset,0px));height:min(520px,calc(100vh - 110px - var(--sw-mobile-offset,0px)))}}";

  var BUBBLE_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';

  function mount(config) {
    var state = loadState();
    var busy = false;

    var host = el("div");
    host.setAttribute("data-sitewyre-chat", "");
    var root = host.attachShadow({ mode: "open" });
    var style = el("style", null, STYLES);
    root.appendChild(style);
    host.style.setProperty("--sw-color", config.color || DEFAULT_COLOR);
    var mobileOffset = parseInt(script.getAttribute("data-mobile-offset") || "0", 10);
    if (mobileOffset > 0 && mobileOffset <= 200) host.style.setProperty("--sw-mobile-offset", mobileOffset + "px");

    var bubble = el("button", "bubble");
    bubble.type = "button";
    bubble.setAttribute("aria-label", "Chat with " + config.business_name);
    bubble.setAttribute("aria-expanded", "false");
    // Static, trusted markup only (the icon) — never visitor or server text.
    bubble.innerHTML = BUBBLE_ICON;

    var panel = el("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat with " + config.business_name);

    var head = el("div", "head");
    head.appendChild(el("h2", null, config.business_name));
    var close = el("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close chat");
    head.appendChild(close);

    var body = el("div", "body");
    var foot = el("div", "foot");
    var note = el("div", "note", "Answers are from a virtual assistant.");

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);
    panel.appendChild(note);
    root.appendChild(panel);
    root.appendChild(bubble);
    document.body.appendChild(host);

    function setOpen(open) {
      panel.classList.toggle("open", open);
      bubble.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        var first = panel.querySelector("input:not(.hp-input),textarea");
        if (first) first.focus();
      }
    }
    bubble.addEventListener("click", function () {
      setOpen(!panel.classList.contains("open"));
    });
    close.addEventListener("click", function () {
      setOpen(false);
      bubble.focus();
    });
    panel.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setOpen(false);
        bubble.focus();
      }
    });

    function showError(container, message) {
      var existing = container.querySelector(".error");
      if (existing) existing.remove();
      if (message) {
        var error = el("p", "error", message);
        error.setAttribute("role", "alert");
        container.appendChild(error);
      }
    }

    function addMessage(role, text) {
      var bubbleNode = el("div", "msg " + role);
      if (role === "assistant") appendLinkified(bubbleNode, text);
      else bubbleNode.textContent = text;
      body.appendChild(bubbleNode);
      body.scrollTop = body.scrollHeight;
    }

    function renderForm() {
      body.textContent = "";
      foot.style.display = "none";

      body.appendChild(
        el("p", "intro", "Tell us what you need and we'll get right back to you. You can ask questions here too."),
      );
      var form = el("form");
      form.noValidate = true;

      function field(labelText, control, id) {
        var wrap = el("div", "field");
        var label = el("label", null, labelText);
        label.htmlFor = id;
        control.id = id;
        wrap.appendChild(label);
        wrap.appendChild(control);
        form.appendChild(wrap);
      }

      var name = el("input");
      name.type = "text";
      name.autocomplete = "name";
      name.maxLength = 100;
      field("Your name", name, "sw-name");

      var phone = el("input");
      phone.type = "tel";
      phone.autocomplete = "tel";
      phone.maxLength = 30;
      field("Phone number", phone, "sw-phone");

      var need = el("textarea");
      need.rows = 3;
      need.maxLength = MAX_LENGTH;
      field("What do you need?", need, "sw-need");

      var trapWrap = el("div", "hp");
      trapWrap.setAttribute("aria-hidden", "true");
      var trap = el("input", "hp-input");
      trap.type = "text";
      trap.tabIndex = -1;
      trap.autocomplete = "off";
      trap.name = "website";
      trapWrap.appendChild(trap);
      form.appendChild(trapWrap);

      form.appendChild(el("p", "consent", config.consent_text));

      var submit = el("button", "start", "Start chat");
      submit.type = "submit";
      form.appendChild(submit);

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (busy) return;
        var values = { name: name.value.trim(), phone: phone.value.trim(), message: need.value.trim() };
        if (!values.name || values.phone.replace(/\D/g, "").length < 7 || !values.message) {
          showError(form, "Please enter your name, a phone number and what you need.");
          return;
        }
        busy = true;
        submit.disabled = true;
        submit.textContent = "Sending…";
        showError(form, null);
        post("/api/public/chat/start", {
          site_key: siteKey,
          name: values.name,
          phone: values.phone,
          message: values.message,
          website: trap.value,
        })
          .then(function (data) {
            state = {
              token: data.session_token,
              messages: [
                { role: "visitor", text: values.message },
                { role: "assistant", text: data.reply },
              ],
            };
            saveState(state);
            renderChat();
          })
          .catch(function (error) {
            showError(form, error.message);
            submit.disabled = false;
            submit.textContent = "Start chat";
          })
          .then(function () {
            busy = false;
          });
      });

      body.appendChild(form);
    }

    function renderChat() {
      body.textContent = "";
      foot.textContent = "";
      foot.style.display = "flex";
      state.messages.forEach(function (m) {
        addMessage(m.role, m.text);
      });

      var input = el("textarea");
      input.rows = 1;
      input.maxLength = MAX_LENGTH;
      input.placeholder = "Type a question…";
      input.setAttribute("aria-label", "Your message");
      var send = el("button", "send", "Send");
      send.type = "button";
      foot.appendChild(input);
      foot.appendChild(send);

      function submit() {
        var text = input.value.trim();
        if (!text || busy) return;
        busy = true;
        send.disabled = true;
        input.value = "";
        showError(body, null);
        addMessage("visitor", text);
        var typing = el("div", "typing", "…");
        typing.setAttribute("aria-label", "The assistant is typing");
        body.appendChild(typing);
        body.scrollTop = body.scrollHeight;

        post("/api/public/chat/message", { session_token: state.token, message: text })
          .then(function (data) {
            typing.remove();
            addMessage("assistant", data.reply);
            state.messages.push({ role: "visitor", text: text }, { role: "assistant", text: data.reply });
            saveState(state);
          })
          .catch(function (error) {
            typing.remove();
            showError(body, error.message);
            body.scrollTop = body.scrollHeight;
          })
          .then(function () {
            busy = false;
            send.disabled = false;
            input.focus();
          });
      }

      send.addEventListener("click", submit);
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submit();
        }
      });
    }

    if (state.token) renderChat();
    else renderForm();
  }

  /* ---------------------------------------------------------------
   * Form capture
   * ------------------------------------------------------------- */

  var SENSITIVE_FIELD = /card|cvv|cvc|ccnum|cc-|expir|routing|iban|acc(oun)?t.?(num|no)|ssn|social.?sec|passw|pin\b/i;
  var SKIP_FORM = /log.?in|sign.?in|sign.?up|register|checkout|cart|payment|billing|password|search|subscribe|newsletter|coupon|discount/i;
  var HONEYPOT_NAME = /honeypot|hp_|_hp\b|botcheck|leave.?blank|_gotcha|website_url/i;
  var EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var TEXT_TYPES = { text: 1, tel: 1, email: 1, number: 1, "": 1 };
  var lastCapture = { signature: "", at: 0 };

  function attr(node, name) {
    return (node.getAttribute(name) || "").toLowerCase();
  }

  /* Everything that says what a field is for: its name, id, placeholder,
   * autocomplete hint and label. Never its value. */
  function describe(field) {
    var label = "";
    try {
      if (field.labels && field.labels[0]) label = field.labels[0].textContent || "";
    } catch {
      /* some controls have no labels list */
    }
    return (
      attr(field, "name") + " " + attr(field, "id") + " " + attr(field, "placeholder") + " " +
      attr(field, "aria-label") + " " + attr(field, "autocomplete") + " " + label.toLowerCase()
    );
  }

  /* A trap field for bots: hidden from people and marked as such. */
  function isHoneypot(field, form) {
    if (field.getAttribute("tabindex") === "-1") return true;
    if (HONEYPOT_NAME.test(attr(field, "name") + " " + attr(field, "id"))) return true;
    for (var node = field; node && node !== form; node = node.parentElement) {
      if (node.getAttribute("aria-hidden") === "true") return true;
    }
    return false;
  }

  /* SMS consent wording shown in or right around the form, if any: kept
   * with the lead as the record of what the visitor saw. */
  function findConsentText(form) {
    var scopes = [form, form.parentElement];
    for (var i = 0; i < scopes.length; i++) {
      var scope = scopes[i];
      if (!scope) continue;
      var nodes = scope.querySelectorAll("p,small,label,span,div,li");
      var best = "";
      for (var j = 0; j < nodes.length; j++) {
        var text = (nodes[j].textContent || "").replace(/\s+/g, " ").trim();
        if (text.length > 600 || text.length < 20) continue;
        if (/text messages?|\bsms\b/i.test(text) && /\bstop\b/i.test(text)) {
          if (!best || text.length < best.length) best = text;
        }
      }
      if (best) return best;
    }
    return "";
  }

  /* Reads a submitted form. Returns the lead to send, or null when the
   * form isn't a lead form or must be left alone. */
  function readForm(form) {
    if (!form || form.tagName !== "FORM") return null;
    if (form.closest("[data-sitewyre-ignore]") || form.closest("[data-sitewyre-chat]")) return null;
    if (attr(form, "role") === "search" || attr(form, "method") === "get") return null;
    if (SKIP_FORM.test(attr(form, "action") + " " + attr(form, "id") + " " + attr(form, "name") + " " + attr(form, "class"))) {
      return null;
    }
    // A form the browser itself would reject hasn't really been sent.
    if (typeof form.checkValidity === "function" && !form.checkValidity()) return null;

    var lead = { name: "", first: "", last: "", phone: "", email: "", message: "" };
    var fields = form.elements;
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var tag = field.tagName;
      var type = attr(field, "type");
      if (type === "password" || type === "search") return null;
      if (tag !== "INPUT" && tag !== "TEXTAREA") continue;
      var about = describe(field);
      if (SENSITIVE_FIELD.test(about)) return null;
      if (tag === "INPUT" && !TEXT_TYPES[type]) continue;
      var value = (field.value || "").trim();
      if (isHoneypot(field, form)) {
        if (value) return null; // a bot filled the trap
        continue;
      }
      if (!value) continue;

      if (tag === "TEXTAREA") {
        if (value.length > lead.message.length) lead.message = value;
      } else if (type === "email" || /e-?mail/.test(about) || (!type && EMAIL_VALUE.test(value))) {
        if (!lead.email) lead.email = value;
      } else if (type === "tel" || /phone|\btel\b|mobile|\bcell/.test(about)) {
        if (!lead.phone) lead.phone = value;
      } else if (/first|given/.test(about) && /name/.test(about)) {
        lead.first = value;
      } else if (/last|family|surname/.test(about) && /name/.test(about)) {
        lead.last = value;
      } else if (/name/.test(about) && !/company|business|user|organi[sz]ation/.test(about)) {
        if (!lead.name) lead.name = value;
      } else if (/message|comment|details|question|inquiry|enquiry|how can we help|describe|notes/.test(about)) {
        if (!lead.message) lead.message = value;
      }
    }

    var name = lead.name || (lead.first + " " + lead.last).trim();
    var hasPhone = lead.phone.replace(/\D/g, "").length >= 10;
    var hasEmail = EMAIL_VALUE.test(lead.email);
    // A phone number, or an email with a message. An email on its own is a
    // newsletter sign-up, not an enquiry.
    if (!hasPhone && !(hasEmail && lead.message)) return null;

    return {
      name: name.slice(0, 200),
      phone: hasPhone ? lead.phone.slice(0, 60) : "",
      email: hasEmail ? lead.email.slice(0, 200) : "",
      message: lead.message.slice(0, 4000),
      form_label: (form.getAttribute("id") || form.getAttribute("name") || form.getAttribute("aria-label") || "").slice(0, 200),
      consent_text: findConsentText(form).slice(0, 1000),
    };
  }

  function sendCapture(lead) {
    var signature = lead.phone + "|" + lead.email + "|" + lead.message;
    var now = Date.now();
    // A double click sends the form twice; one copy is enough.
    if (signature === lastCapture.signature && now - lastCapture.at < 5000) return;
    lastCapture = { signature: signature, at: now };

    lead.site_key = siteKey;
    lead.page_url = window.location.href.slice(0, 1000);
    var url = apiBase + "/api/public/capture";
    var payload = JSON.stringify(lead);
    // text/plain needs no pre-flight request, and keepalive lets the copy
    // finish even if the form takes the visitor to another page.
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: payload,
        keepalive: true,
      }).catch(function () {
        /* never surfaces on the host page */
      });
    } catch {
      if (navigator.sendBeacon) navigator.sendBeacon(url, payload);
    }
  }

  function startCapture() {
    // Capture phase, so this runs before the site's own handler, and it
    // never calls preventDefault: the form carries on exactly as it would.
    document.addEventListener(
      "submit",
      function (event) {
        try {
          var lead = readForm(event.target);
          if (lead) sendCapture(lead);
        } catch {
          /* the script never breaks the host page */
        }
      },
      true,
    );
  }

  /* ---------------------------------------------------------------
   * Embeds: booking calendar and lead form
   * ------------------------------------------------------------- */

  var EMBEDS = {
    booking: { path: "/embed/book/", title: "Book online", height: 760 },
    "lead-form": { path: "/embed/lead/", title: "Contact form", height: 620 },
  };

  function mountEmbeds() {
    var slots = document.querySelectorAll("[data-sitewyre]");
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var embed = EMBEDS[slot.getAttribute("data-sitewyre")];
      if (!embed || slot.getAttribute("data-sitewyre-ready")) continue;
      slot.setAttribute("data-sitewyre-ready", "1");
      var frame = document.createElement("iframe");
      frame.src = apiBase + embed.path + encodeURIComponent(siteKey);
      frame.title = embed.title;
      frame.loading = "lazy";
      frame.style.cssText = "width:100%;border:0;display:block;height:" + embed.height + "px";
      slot.appendChild(frame);
    }
  }

  /* A Sitewyre frame reports how tall its content is; fit the frame to it
   * so there's no scrollbar inside the page. Only messages from the portal
   * are listened to, and only a height is ever read from them. */
  window.addEventListener("message", function (event) {
    if (event.origin !== apiBase) return;
    var data = event.data;
    if (!data || data.type !== "sitewyre:height" || typeof data.height !== "number") return;
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        frames[i].style.height = Math.min(Math.max(Math.round(data.height), 200), 4000) + "px";
      }
    }
  });

  var lookup = siteKey
    ? "site_key=" + encodeURIComponent(siteKey)
    : "domain=" + encodeURIComponent(window.location.hostname);
  fetch(apiBase + "/api/public/chat/config?" + lookup)
    .then(function (res) {
      return res.json();
    })
    .then(function (config) {
      if (!config) return;
      if (config.site_key) siteKey = config.site_key;
      if (config.capture && siteKey) startCapture();
      var whenReady = function (run) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
        else run();
      };
      if (siteKey) whenReady(mountEmbeds);
      if (!config.enabled) return;
      whenReady(function () {
        mount(config);
      });
    })
    .catch(function () {
      /* The script never breaks the host page. */
    });
})();
