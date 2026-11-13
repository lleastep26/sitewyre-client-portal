/*
 * Sitewyre website chat widget.
 *
 * Install with one tag, just before </body>:
 *   <script src="https://<portal>/widget.js" data-site-key="..." async></script>
 * Without data-site-key the business is looked up by the page's domain.
 * Optional data-mobile-offset="66" lifts the bubble by that many pixels on
 * narrow screens, for sites with a bar fixed to the bottom of the page.
 *
 * Plain JavaScript, no dependencies. Everything is drawn inside a shadow
 * root so the host site's styles can't affect it and its styles can't leak
 * out. All text is written with textContent, never innerHTML.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || window.__sitewyreChatLoaded) return;
  var siteKey = script.getAttribute("data-site-key");
  window.__sitewyreChatLoaded = true;

  var apiBase = new URL(script.src, window.location.href).origin;
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
    var turnstileToken = null;

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

    /* Turnstile is drawn outside the shadow root (it doesn't reliably
     * render inside one), and only if the portal has a site key set. */
    function setUpTurnstile() {
      if (!config.turnstile_site_key) return;
      var holder = el("div");
      holder.style.cssText = "position:fixed;right:16px;bottom:84px;z-index:2147483001";
      document.body.appendChild(holder);
      window.__sitewyreTurnstileReady = function () {
        if (!window.turnstile) return;
        window.turnstile.render(holder, {
          sitekey: config.turnstile_site_key,
          appearance: "interaction-only",
          callback: function (token) {
            turnstileToken = token;
          },
        });
      };
      var ts = document.createElement("script");
      ts.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__sitewyreTurnstileReady";
      ts.async = true;
      document.head.appendChild(ts);
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
          turnstile_token: turnstileToken || undefined,
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
    else {
      renderForm();
      setUpTurnstile();
    }
  }

  var lookup = siteKey
    ? "site_key=" + encodeURIComponent(siteKey)
    : "domain=" + encodeURIComponent(window.location.hostname);
  fetch(apiBase + "/api/public/chat/config?" + lookup)
    .then(function (res) {
      return res.json();
    })
    .then(function (config) {
      if (!config || !config.enabled) return;
      siteKey = config.site_key;
      if (document.body) mount(config);
      else document.addEventListener("DOMContentLoaded", function () { mount(config); });
    })
    .catch(function () {
      /* The widget never breaks the host page. */
    });
})();
