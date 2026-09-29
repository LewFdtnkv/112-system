export interface Authentication {
  accessToken: () => string | undefined;
  generation: () => number;
  refresh: () => Promise<void>;
  expired: () => void;
  passwordRequired: () => void;
}
