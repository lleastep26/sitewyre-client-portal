import { describe, expect, it } from "vitest";
import { classifyInboundCall, ownNumbers } from "@/lib/twilio/forwarded-calls";

const SITEWYRE = "+14055550100";
const CALLER = "+14055550199";
const client = {
  forward_to_phone: "+14055550111",
  phone: "405-555-0111",
  business_line_phone: "(405) 555-0122",
  call_forwarding_enabled: false,
};

describe("ownNumbers", () => {
  it("normalises and drops blanks", () => {
    expect(ownNumbers({ forward_to_phone: null, phone: "", business_line_phone: "4055550122" })).toEqual([
      "+14055550122",
    ]);
  });
});

describe("classifyInboundCall", () => {
  it("leaves an ordinary call alone", () => {
    expect(classifyInboundCall(client, { from: CALLER, to: SITEWYRE, forwardedFrom: "" })).toEqual({
      kind: "direct",
    });
  });

  it("treats every call as forwarded when the client's setting is on, with or without ForwardedFrom", () => {
    const on = { ...client, call_forwarding_enabled: true };
    expect(classifyInboundCall(on, { from: CALLER, to: SITEWYRE, forwardedFrom: "" })).toEqual({
      kind: "forwarded",
      forwardedFrom: "+14055550122",
      mayBeBounce: false,
      callerKnown: true,
    });
    expect(
      classifyInboundCall(on, { from: CALLER, to: SITEWYRE, forwardedFrom: "+14055550122" }),
    ).toMatchObject({ kind: "forwarded", forwardedFrom: "+14055550122", mayBeBounce: false });
  });

  it("spots a forwarded call by ForwardedFrom when the setting is off, and flags it as a possible bounce", () => {
    for (const own of ["+14055550122", "4055550111"]) {
      expect(
        classifyInboundCall(client, { from: CALLER, to: SITEWYRE, forwardedFrom: own }),
      ).toMatchObject({ kind: "forwarded", mayBeBounce: true, callerKnown: true });
    }
  });

  it("ignores a ForwardedFrom that isn't one of the business's own numbers", () => {
    expect(
      classifyInboundCall(client, { from: CALLER, to: SITEWYRE, forwardedFrom: "+19995550000" }),
    ).toEqual({ kind: "direct" });
  });

  it("recognises our own ring to the owner coming back", () => {
    expect(
      classifyInboundCall(
        { ...client, call_forwarding_enabled: true },
        { from: SITEWYRE, to: SITEWYRE, forwardedFrom: "+14055550111" },
      ),
    ).toEqual({ kind: "own_leg" });
  });

  it("marks the caller unknown when caller ID is the business's own line", () => {
    expect(
      classifyInboundCall(
        { ...client, call_forwarding_enabled: true },
        { from: "+14055550122", to: SITEWYRE, forwardedFrom: "" },
      ),
    ).toMatchObject({ kind: "forwarded", callerKnown: false });
  });

  it("records 'unknown' when nothing says where the call was forwarded from", () => {
    expect(
      classifyInboundCall(
        { forward_to_phone: null, call_forwarding_enabled: true },
        { from: CALLER, to: SITEWYRE, forwardedFrom: "" },
      ),
    ).toMatchObject({ kind: "forwarded", forwardedFrom: "unknown" });
  });
});
