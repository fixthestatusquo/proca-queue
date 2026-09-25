import { describe, expect, it } from "vitest";
import type { ActionMessageV1, ActionMessageV2 } from "./actionMessage";
import { actionMessageV1to2 } from "./actionMessage";

const v1 = (contact: Partial<ActionMessageV1["contact"]>): ActionMessageV1 => ({
  actionId: 1,
  actionPageId: 2,
  campaignId: 3,
  action: {
    actionType: "sign",
    fields: { country: "PL" },
    createdAt: "2020-01-01T00:00:00.000Z",
    testing: false,
  },
  contact: {
    email: "a@b.c",
    firstName: "Jan",
    ref: "ref-1",
    payload: "{}",
    area: null,
    ...contact,
  },
  campaign: { title: "T", name: "n", externalId: 9 },
  actionPage: { locale: "pl", name: "ap", thankYouTemplate: "t", thankYouTemplateRef: "r" },
  tracking: { source: "s", medium: "m", campaign: "c", content: "x", location: "l" },
  privacy: { communication: true, givenAt: "2020-01-01T00:00:00.000Z" },
  schema: "proca:action:1",
  stage: "deliver",
});

describe("actionMessageV1to2", () => {
  it("spreads unencrypted payload PII into contact", () => {
    const v2 = actionMessageV1to2(v1({ payload: JSON.stringify({ lastName: "Kowalski" }) })) as ActionMessageV2;
    expect(v2.schema).toBe("proca:action:2");
    expect(v2.personalInfo).toBeNull();
    expect(v2.contact).toMatchObject({ contactRef: "ref-1", lastName: "Kowalski" });
    expect(v2.privacy.withConsent).toBe(true);
  });

  it("builds PersonalInfo for encrypted payloads", () => {
    const v2 = actionMessageV1to2(
      v1({ nonce: "n", publicKey: "pub", signKey: "sig", payload: "ciphertext" })
    ) as ActionMessageV2;
    expect(v2.personalInfo).toMatchObject({ payload: "ciphertext", nonce: "n" });
  });

  it("throws on malformed payload JSON", () => {
    expect(() => actionMessageV1to2(v1({ payload: "not json" }))).toThrow(/invalid contact payload JSON/);
  });
});
