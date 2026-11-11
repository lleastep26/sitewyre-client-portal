"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { renderTemplatePreview } from "@/lib/funnels/template-preview";
import { setAutomationTemplate } from "./actions";

export function TemplateEditor({
  trigger,
  defaultValue,
  fallbackTemplate,
  variables,
  sampleValues,
}: {
  trigger: string;
  defaultValue: string;
  fallbackTemplate: string;
  variables: string[];
  sampleValues: Record<string, string>;
}) {
  const [draft, setDraft] = useState(defaultValue);
  const preview = renderTemplatePreview(
    draft.trim() ? draft : fallbackTemplate,
    sampleValues,
  );

  return (
    <form
      action={async (fd) => {
        await setAutomationTemplate(fd);
      }}
      className="mt-3 space-y-2"
    >
      <input type="hidden" name="trigger" value={trigger} />
      <textarea
        name="template_body"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-xs"
      />
      {variables.length > 0 ? (
        <p className="text-[11px] text-charcoal/50">
          Template vars: {variables.map((v) => `{{${v}}}`).join(", ")}
        </p>
      ) : null}
      <div className="rounded-md bg-charcoal/5 px-3 py-2 text-xs text-charcoal/80">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-charcoal/40">
          Preview
        </p>
        {preview}
      </div>
      <Button type="submit" size="sm" variant="secondary">
        Save template
      </Button>
    </form>
  );
}
