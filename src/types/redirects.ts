export type ChaiRedirectEntry = {
  id: string;
  fromPath: string;
  toPath: string;
  permanent: boolean;
  /** False = kept but not served, so a rule can be parked without losing it. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
