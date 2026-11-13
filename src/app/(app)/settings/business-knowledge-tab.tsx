"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addFaq, deleteFaq, updateBusinessKnowledge, updateFaq } from "./business-knowledge-actions";

type Faq = { id: string; question: string; answer: string };

function FaqRow({
  faq,
  canEdit,
}: {
  faq: Faq;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("faqId", faq.id);
      fd.set("question", question);
      fd.set("answer", answer);
      const result = await updateFaq(fd);
      if ("error" in result) setError(result.error);
      else setEditing(false);
    });
  }

  function remove() {
    start(async () => {
      const fd = new FormData();
      fd.set("faqId", faq.id);
      await deleteFaq(fd);
    });
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="w-full rounded-md border border-charcoal/15 px-2 py-1 text-sm font-medium"
        />
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-md border border-charcoal/15 px-2 py-1 text-sm"
        />
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm">
      <p className="font-medium">{faq.question}</p>
      <p className="mt-1 text-charcoal/70">{faq.answer}</p>
      {canEdit ? (
        <div className="mt-2 flex gap-3 text-xs">
          <button type="button" className="text-copper" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="text-red-600"
            disabled={pending}
            onClick={remove}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AddFaqForm() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("question", question);
      fd.set("answer", answer);
      const result = await addFaq(fd);
      if ("error" in result) setError(result.error);
      else {
        setQuestion("");
        setAnswer("");
      }
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-charcoal/20 p-3 text-sm">
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question"
        className="w-full rounded-md border border-charcoal/15 px-2 py-1 text-sm"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Answer"
        rows={2}
        className="mt-2 w-full rounded-md border border-charcoal/15 px-2 py-1 text-sm"
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      <Button type="button" size="sm" className="mt-2" disabled={pending} onClick={submit}>
        {pending ? "Adding…" : "Add FAQ"}
      </Button>
    </div>
  );
}

export function BusinessKnowledgeTab({
  canEdit,
  serviceArea,
  servicesOffered,
  servicesOfferedPlaceholder,
  hoursSummary,
  afterHoursRules,
  aiNeverSay,
  faqs,
}: {
  canEdit: boolean;
  serviceArea: string | null;
  servicesOffered: string | null;
  servicesOfferedPlaceholder: string;
  hoursSummary: string;
  afterHoursRules: string | null;
  aiNeverSay: string | null;
  faqs: Faq[];
}) {
  const [servicesOfferedInput, setServicesOfferedInput] = useState(
    servicesOffered ?? servicesOfferedPlaceholder,
  );
  const [afterHoursInput, setAfterHoursInput] = useState(afterHoursRules ?? "");
  const [aiNeverSayInput, setAiNeverSayInput] = useState(aiNeverSay ?? "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  function save() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("services_offered", servicesOfferedInput);
      fd.set("after_hours_rules", afterHoursInput);
      fd.set("ai_never_say", aiNeverSayInput);
      const result = await updateBusinessKnowledge(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: "Saved." });
    });
  }

  return (
    <div className="space-y-5">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can edit
          Business knowledge.
        </p>
      ) : null}

      <div>
        <Label>Service area</Label>
        <p className="mt-1 text-sm text-charcoal">{serviceArea ?? "Not set"}</p>
        <p className="text-xs text-charcoal/50">Edit this in the Business Profile tab.</p>
      </div>

      <div>
        <Label htmlFor="services_offered">Services offered</Label>
        <textarea
          id="services_offered"
          value={servicesOfferedInput}
          onChange={(e) => setServicesOfferedInput(e.target.value)}
          disabled={!canEdit}
          rows={4}
          className="mt-1 w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <Label>Business hours</Label>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-charcoal/5 px-3 py-2 text-xs text-charcoal/70">
          {hoursSummary}
        </pre>
        <p className="text-xs text-charcoal/50">Edit booking hours in the General tab.</p>
      </div>

      <div>
        <Label htmlFor="after_hours_rules">After-hours rules</Label>
        <textarea
          id="after_hours_rules"
          value={afterHoursInput}
          onChange={(e) => setAfterHoursInput(e.target.value)}
          disabled={!canEdit}
          rows={3}
          placeholder="e.g. After 6pm, tell the caller we'll call back first thing in the morning."
          className="mt-1 w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <Label>FAQs</Label>
        <div className="mt-2 space-y-2">
          {faqs.map((f) => (
            <FaqRow key={f.id} faq={f} canEdit={canEdit} />
          ))}
          {canEdit ? <AddFaqForm /> : null}
        </div>
      </div>

      <div>
        <Label htmlFor="ai_never_say">Things the AI must never say</Label>
        <textarea
          id="ai_never_say"
          value={aiNeverSayInput}
          onChange={(e) => setAiNeverSayInput(e.target.value)}
          disabled={!canEdit}
          rows={3}
          placeholder="e.g. Never quote a price over the phone. Never promise a same-day appointment."
          className="mt-1 w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm"
        />
      </div>

      {canEdit ? (
        <Button type="button" className="w-full" disabled={pending} onClick={save}>
          Save
        </Button>
      ) : null}

      {message ? (
        <p className={message.kind === "ok" ? "text-sm text-copper" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
