"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COUNTRY_OPTIONS,
  NICHE_OPTIONS,
  US_STATE_OPTIONS,
  US_TIMEZONE_OPTIONS,
} from "@/lib/business-profile/options";
import {
  removeBusinessLogo,
  updateBusinessProfile,
  uploadBusinessLogo,
} from "./business-profile-actions";

type BusinessProfileValues = {
  business_name: string;
  legal_business_name: string;
  owner_name: string;
  business_email: string;
  phone: string;
  website: string;
  domain: string;
  trade: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  timezone: string;
  logo_url: string | null;
};

const selectClass =
  "h-11 w-full rounded-md border border-charcoal/20 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50";

export function BusinessProfileTab({
  initial,
  canEdit,
  canEditDomain,
}: {
  initial: BusinessProfileValues;
  canEdit: boolean;
  canEditDomain: boolean;
}) {
  const [logoUrl, setLogoUrl] = useState(initial.logo_url);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSave(formData: FormData) {
    setMessage(null);
    start(async () => {
      const result = await updateBusinessProfile(formData);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: "Saved." });
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    const fd = new FormData();
    fd.set("logo", file);
    start(async () => {
      const result = await uploadBusinessLogo(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else {
        setLogoUrl(result.logoUrl);
        setMessage({ kind: "ok", text: "Logo updated." });
      }
    });
    e.target.value = "";
  }

  function handleRemoveLogo() {
    setMessage(null);
    start(async () => {
      const result = await removeBusinessLogo();
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else {
        setLogoUrl(null);
        setMessage({ kind: "ok", text: "Logo removed." });
      }
    });
  }

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can edit the
          business profile.
        </p>
      ) : null}

      <div>
        <Label>Business logo</Label>
        <p className="mt-1 text-xs text-charcoal/50">
          PNG or JPG, max 2.5MB. Recommended 350×180px.
        </p>
        <div className="mt-2 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Business logo"
              className="h-16 w-auto max-w-[200px] rounded border border-charcoal/10 bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-16 w-28 items-center justify-center rounded border border-dashed border-charcoal/20 text-xs text-charcoal/40">
              No logo
            </div>
          )}
          {canEdit ? (
            <div className="flex flex-col gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleLogoChange}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
              >
                {logoUrl ? "Replace" : "Upload"}
              </Button>
              {logoUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={handleRemoveLogo}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <form action={handleSave} className="space-y-3">
        <div>
          <Label htmlFor="bp_business_name">Business name</Label>
          <Input
            id="bp_business_name"
            name="business_name"
            defaultValue={initial.business_name}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_legal_business_name">Legal business name</Label>
          <Input
            id="bp_legal_business_name"
            name="legal_business_name"
            defaultValue={initial.legal_business_name}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_owner_name">Owner name</Label>
          <Input
            id="bp_owner_name"
            name="owner_name"
            defaultValue={initial.owner_name}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_business_email">Business email</Label>
          <Input
            id="bp_business_email"
            name="business_email"
            type="email"
            defaultValue={initial.business_email}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_phone">Business phone (alerts are sent here)</Label>
          <Input
            id="bp_phone"
            name="phone"
            defaultValue={initial.phone}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_domain">
            Website domain {canEditDomain ? "" : "(admin only)"}
          </Label>
          <Input
            id="bp_domain"
            name="domain"
            defaultValue={initial.domain}
            disabled={!canEditDomain}
            placeholder="acme-plumbing.com"
            autoCapitalize="none"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-charcoal/50">
            The address of the live website, without https:// or www — for
            example acme-plumbing.com. Website lead forms and the chat widget
            find this business by it, so it has to match the live site.
            {canEditDomain
              ? " You can paste the full link; it's trimmed to the domain when saved."
              : " Only a Sitewyre admin can change it."}
          </p>
          {!initial.domain ? (
            <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No website domain is saved yet, so website lead forms and the
              chat widget can&apos;t find this business.
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="bp_website">Business website</Label>
          <Input
            id="bp_website"
            name="website"
            defaultValue={initial.website}
            disabled={!canEdit}
            placeholder="https://example.com"
          />
        </div>
        <div>
          <Label htmlFor="bp_trade">Business niche</Label>
          <select
            id="bp_trade"
            name="trade"
            defaultValue={initial.trade}
            disabled={!canEdit}
            className={selectClass}
          >
            {NICHE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="bp_address_line1">Street address</Label>
          <Input
            id="bp_address_line1"
            name="address_line1"
            defaultValue={initial.address_line1}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_city">City</Label>
          <Input
            id="bp_city"
            name="city"
            defaultValue={initial.city}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_postal_code">Postal code</Label>
          <Input
            id="bp_postal_code"
            name="postal_code"
            defaultValue={initial.postal_code}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="bp_state">State</Label>
          <select
            id="bp_state"
            name="state"
            defaultValue={initial.state}
            disabled={!canEdit}
            className={selectClass}
          >
            <option value="">Select a state</option>
            {US_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="bp_country">Country</Label>
          <select
            id="bp_country"
            name="country"
            defaultValue={initial.country || "US"}
            disabled={!canEdit}
            className={selectClass}
          >
            {COUNTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="bp_timezone">Time zone</Label>
          <select
            id="bp_timezone"
            name="timezone"
            defaultValue={initial.timezone || "America/Chicago"}
            disabled={!canEdit}
            className={selectClass}
          >
            {US_TIMEZONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {message ? (
          <p
            className={
              message.kind === "ok"
                ? "text-sm text-copper"
                : "text-sm text-red-600"
            }
          >
            {message.text}
          </p>
        ) : null}

        {canEdit ? (
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
