import { registerTestBlocks } from "~/tests/builder/blocks";
import { checkMissingTranslations } from "./use-save-page";

registerTestBlocks({
  type: "Promo",
  i18nProps: ["label"],
  i18nDefaultProps: ["label"],
});

const promo = (props: Record<string, unknown>) => [{ _id: "b", _type: "Promo", ...props }];

describe("checkMissingTranslations with i18nDefaultProps", () => {
  it("skips a default-owned prop that is blank in the fallback language", () => {
    expect(checkMissingTranslations(promo({ label: "" }), "en")).toBe(false);
    expect(checkMissingTranslations(promo({ label: "  " }), "en")).toBe(false);
    expect(checkMissingTranslations(promo({}), "en")).toBe(false);
  });

  it("reports a set override with a blank translation", () => {
    expect(checkMissingTranslations(promo({ label: "Demander" }), "en")).toBe(true);
    expect(checkMissingTranslations(promo({ label: "Demander", "label-en": "Ask" }), "en")).toBe(false);
  });
});
