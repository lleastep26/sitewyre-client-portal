"use client";

import { Children, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { searchPortal, type PortalSearchResult } from "@/lib/search/portal-search";

const EMPTY: PortalSearchResult = { pages: [], contacts: [], leads: [], jobs: [] };

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PortalSearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    const timeout = setTimeout(async () => {
      if (!trimmed) {
        setResults(EMPTY);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const r = await searchPortal(trimmed);
        setResults(r);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults(EMPTY);
    }
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  const hasResults =
    results.pages.length ||
    results.contacts.length ||
    results.leads.length ||
    results.jobs.length;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-charcoal/15 bg-charcoal/5 px-3 text-sm text-charcoal/50 hover:bg-charcoal/10"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-charcoal/20 bg-white px-1.5 py-0.5 text-[10px] text-charcoal/50">
            ⌘K
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-charcoal/40" />
        <Dialog.Content
          className="fixed left-1/2 top-24 z-50 w-[92vw] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-2xl"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-charcoal/10 px-3">
            <Search className="h-4 w-4 text-charcoal/40" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages, contacts, leads, jobs…"
              className="h-12 flex-1 bg-transparent text-sm text-charcoal outline-none placeholder:text-charcoal/40"
            />
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-charcoal/40" />
            ) : null}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {!query.trim() ? (
              <p className="px-2 py-6 text-center text-sm text-charcoal/40">
                Jump to a page, or find a contact, lead, or job.
              </p>
            ) : !hasResults && !loading ? (
              <p className="px-2 py-6 text-center text-sm text-charcoal/40">
                No results for &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <>
                <ResultGroup title="Pages">
                  {results.pages.map((p) => (
                    <ResultRow key={p.href} onSelect={() => go(p.href)}>
                      {p.label}
                    </ResultRow>
                  ))}
                </ResultGroup>
                <ResultGroup title="Contacts">
                  {results.contacts.map((c) => (
                    <ResultRow
                      key={c.id}
                      onSelect={() => go(`/inbox?contact=${c.id}`)}
                    >
                      {c.name}
                      {c.phone ? (
                        <span className="text-charcoal/40"> · {c.phone}</span>
                      ) : null}
                    </ResultRow>
                  ))}
                </ResultGroup>
                <ResultGroup title="Leads">
                  {results.leads.map((l) => (
                    <ResultRow
                      key={l.id}
                      onSelect={() => go(`/leads?open=${l.id}#lead-${l.id}`)}
                    >
                      {l.name}
                      <span className="text-charcoal/40"> · {l.phone}</span>
                    </ResultRow>
                  ))}
                </ResultGroup>
                <ResultGroup title="Jobs">
                  {results.jobs.map((j) => (
                    <ResultRow
                      key={j.id}
                      onSelect={() => go(`/jobs?open=${j.id}#job-${j.id}`)}
                    >
                      {j.address ?? "No address"}
                      {j.contactName ? (
                        <span className="text-charcoal/40"> · {j.contactName}</span>
                      ) : null}
                    </ResultRow>
                  ))}
                </ResultGroup>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ResultGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const items = Children.toArray(children);
  if (!items.length) return null;
  return (
    <div className="mb-2">
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-charcoal/40">
        {title}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  children,
  onSelect,
}: {
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-charcoal hover:bg-charcoal/5"
    >
      {children}
    </button>
  );
}
