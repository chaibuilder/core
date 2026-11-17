import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

const CHAI_FEATURE_FLAGS: Record<string, ChaiFlagOptions> = {};

type ChaiFlagOptions = {
  key: string;
  value?: any;
  description?: string;
};

export const registerChaiFeatureFlag = (key: string, flagOptions: Omit<ChaiFlagOptions, "key">) => {
  if (CHAI_FEATURE_FLAGS[key]) {
    console.warn(`Flag ${key} already exists`);
  }
  CHAI_FEATURE_FLAGS[key] = { key, value: false, ...flagOptions };
};

export const registerChaiFeatureFlags = (flags: Record<string, Omit<ChaiFlagOptions, "key">>) => {
  Object.entries(flags).forEach(([key, flagOptions]) => {
    if (CHAI_FEATURE_FLAGS[key]) {
      console.warn(`Flag ${key} already exists`);
    }
    registerChaiFeatureFlag(key, flagOptions);
  });
};

export const useChaiFeatureFlags = () => {
  return CHAI_FEATURE_FLAGS;
};

const featureFlagsAtom = atomWithStorage<string[]>("chai-feature-flags", []);
export const useChaiFeatureFlag = (flagKey: string) => {
  const [flags] = useAtom(featureFlagsAtom);
  return flags.includes(flagKey);
};

export const useChaiFeatureFlagToggle = (flagKey: string) => {
  const [flags, setFlags] = useAtom(featureFlagsAtom);
  const toggleFlag = () => {
    if (flags.includes(flagKey)) {
      setFlags(flags.filter((flag) => flag !== flagKey));
    } else {
      setFlags([...flags, flagKey]);
    }
  };
  return toggleFlag;
};

export const IfChaiFeatureFlag = ({ flagKey, children }: { flagKey: string; children: React.ReactNode }) => {
  const flag = useChaiFeatureFlag(flagKey);
  return flag ? children : null;
};
