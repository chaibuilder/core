import { BANS, CRAFT_FLOOR } from "../rules-in-force";
import {
  AUDIT_GUIDE,
  BOLDER_GUIDE,
  COLOR_GUIDE,
  COPY_GUIDE,
  CRITIQUE_GUIDE,
  LAYOUT_GUIDE,
  MOTION_GUIDE,
  POLISH_GUIDE,
  QUIETER_GUIDE,
  TYPOGRAPHY_GUIDE,
} from "./refine";
import { SETUP_GUIDE } from "./setup";

const CRAFT_FLOOR_GUIDE = `# Craft floor
The quality floor every page should meet, and the patterns that make a page read as machine-made.

${CRAFT_FLOOR}

${BANS}

check_page_design verifies what can be read from the blocks; look at the preview for the rest.`;

export const DESIGN_GUIDES = {
  setup: SETUP_GUIDE,
  "craft-floor": CRAFT_FLOOR_GUIDE,
  critique: CRITIQUE_GUIDE,
  audit: AUDIT_GUIDE,
  polish: POLISH_GUIDE,
  typography: TYPOGRAPHY_GUIDE,
  color: COLOR_GUIDE,
  layout: LAYOUT_GUIDE,
  motion: MOTION_GUIDE,
  copy: COPY_GUIDE,
  bolder: BOLDER_GUIDE,
  quieter: QUIETER_GUIDE,
} as const;

export type DesignGuideTopic = keyof typeof DESIGN_GUIDES;
export const DESIGN_GUIDE_TOPICS = Object.keys(DESIGN_GUIDES) as [DesignGuideTopic, ...DesignGuideTopic[]];

export const getDesignGuide = (topic: DesignGuideTopic): string => DESIGN_GUIDES[topic];
