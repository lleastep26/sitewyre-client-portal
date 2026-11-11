import { describe, expect, it } from "vitest";
import {
  buildSampleTemplateValues,
  extractTemplateVariables,
  renderTemplatePreview,
} from "@/lib/funnels/template-preview";

describe("extractTemplateVariables", () => {
  it("returns unique variable names in order of first appearance", () => {
    expect(
      extractTemplateVariables(
        "Hi {{first_name}}, it's {{owner_name}} from {{business_name}}. {{business_name}} says hi.",
      ),
    ).toEqual(["first_name", "owner_name", "business_name"]);
  });

  it("returns an empty array when there are no variables", () => {
    expect(extractTemplateVariables("No vars here.")).toEqual([]);
  });
});

describe("buildSampleTemplateValues", () => {
  it("prefers the client's real business_name, owner_name, and phone", () => {
    const values = buildSampleTemplateValues({
      business_name: "Exclusive Cleaning",
      owner_name: "Pat",
      phone: "+15550001234",
    });
    expect(values.business_name).toBe("Exclusive Cleaning");
    expect(values.owner_name).toBe("Pat");
    expect(values.phone).toBe("+15550001234");
  });

  it("falls back to generic sample values when the client has none set", () => {
    const values = buildSampleTemplateValues({});
    expect(values.business_name).toBe("Your Business");
    expect(values.owner_name).toBe("the owner");
    expect(values.review_link).toBeTruthy();
  });
});

describe("renderTemplatePreview", () => {
  it("replaces known variables with sample values", () => {
    const result = renderTemplatePreview(
      "Hi {{first_name}}, it's {{owner_name}}.",
      { first_name: "Alex", owner_name: "Pat" },
    );
    expect(result).toBe("Hi Alex, it's Pat.");
  });

  it("leaves an unrecognized placeholder untouched", () => {
    const result = renderTemplatePreview("Hi {{unknown_var}}!", {});
    expect(result).toBe("Hi {{unknown_var}}!");
  });
});
