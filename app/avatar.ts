export type AvatarSilhouette = 'masculine' | 'feminine' | 'neutral';
export type AvatarHairStyle = 'short' | 'long' | 'curly';
export type AvatarHairColor = 'brown' | 'black' | 'blonde';
export type AvatarOutfit = 'sage' | 'plum' | 'ocean' | 'coral' | 'courier_red';

export type AvatarAppearance = {
  silhouette: AvatarSilhouette;
  hair_style: AvatarHairStyle;
  hair_color: AvatarHairColor;
  outfit: AvatarOutfit;
};

export type AvatarProgress = {
  active_days: number;
  completed_tasks: number;
  unlocked_hair_styles: AvatarHairStyle[];
  unlocked_outfits: AvatarOutfit[];
  courier_enabled: boolean;
};

export type MemberAvatar = { appearance: AvatarAppearance; progress: AvatarProgress };

export const defaultAvatar: MemberAvatar = {
  appearance: { silhouette: 'neutral', hair_style: 'short', hair_color: 'brown', outfit: 'sage' },
  progress: { active_days: 0, completed_tasks: 0, unlocked_hair_styles: ['short'], unlocked_outfits: ['sage'], courier_enabled: false },
};
