import { ChaiSlot } from "~/builder/register-apis";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";

/**
 * Language switcher seam. The multilingual plugin registers the real switcher
 * under `LANGUAGE_SWITCHER`; the OSS core renders nothing here. Kept as a
 * component (and re-exported from the builder barrel) for API compatibility.
 */
export const ChaiLanguageSwitcher = (props: { showAdd?: boolean; goToDefaultLang?: boolean; showCode?: boolean }) => {
  return <ChaiSlot slotId={CHAI_SLOT_IDS.LANGUAGE_SWITCHER} context={props} />;
};

export default function TopbarLeft() {
  return (
    <div className="relative z-10 flex items-center justify-end gap-1">
      <ChaiSlot slotId={CHAI_SLOT_IDS.TOPBAR_LEFT} />
    </div>
  );
}
