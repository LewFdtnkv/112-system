export type UserPhotoProps = {
  userId: string;
  size?: "small" | "profile";
  decorative?: boolean;
};

export type UserIdentityProps = {
  userId: string;
  name: string;
};
