export const roomPalettes = {
  forest: { label: 'Bosque', background: '#bfc6a1', wall: '#b0bda1', side: '#e3c5a1', rug: '#ae6554', trim: '#ddb072' },
  sunset: { label: 'Atardecer', background: '#e0a884', wall: '#d19a82', side: '#edd0a7', rug: '#aa5771', trim: '#f4bd9d' },
  night: { label: 'Noche', background: '#747fa8', wall: '#868caf', side: '#b6a4b5', rug: '#64628c', trim: '#c3a7c8' },
} as const;

export type RoomPalette = keyof typeof roomPalettes;
export type RoomStyle = { palette: RoomPalette; revision: number };

export const defaultRoomStyle: RoomStyle = { palette: 'forest', revision: 0 };
