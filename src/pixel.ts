export interface PixelSprite {
  rows: string[];
  palette: Record<string, string>;
}

// Each row stores the left half of a 24x24 sprite; the right half is mirrored at draw time.
const PLAYER_ROWS = [
  '000000000000','000000110000','000001221000','000012332100','000123443210','001234554321',
  '012345665432','123455665543','123455665543','012344554321','001233443210','000123332100',
  '000123332100','001234443210','012344444321','123444444432','123344443332','012233332210',
  '001222222100','000122221000','000011110000','000001100000','000000000000','000000000000',
];
const BOSS_A = [
  '000000000000',
  '000000110000',
  '000001221000',
  '000012332100',
  '000123443210',
  '001234554321',
  '012345665432',
  '123455665543',
  '234566776654',
  '345677887765',
  '456788998876',
  '567899AA9876',
  '6789ABCCBA98',
  '56789ABBA987',
  '456789998765',
  '345678887654',
  '234567776543',
  '123456665432',
  '012345554321',
  '001234443210',
  '000123332100',
  '000012221000',
  '000001110000',
  '000000000000'
];
const BOSS_B = [
  '000000000000',
  '000000AA0000',
  '00000ABBA000',
  '0000ABCCBA00',
  '000ABCDDCBA0',
  '00ABCDEEDCBA',
  '0ABCDEFFEDCB',
  'ABCDEFFGGFFE',
  'BCDEFFGHHGFF',
  'CDEFFGHIHGFE',
  'DEFFGHIJIHGF',
  'EFFGHIJJIHGF',
  'DEFFGHIJIHGF',
  'CDEFFGHIHGFE',
  'BCDEFFGHHGFF',
  'ABCDEFFGGFFE',
  '0ABCDEFFEDCB',
  '00ABCDEEDCBA',
  '000ABCDDCBA0',
  '0000ABCCBA00',
  '00000ABBA000',
  '000000AA0000',
  '000000000000',
  '000000000000'
];
const BOSS_C = [
  '000000000000',
  '000000CC0000',
  '00000CDDC000',
  '0000CDEEDC00',
  '000CDEFFEDC0',
  '00CDEFGGFEDC',
  '0CDEFGHHHGFE',
  'CDEFGHIIHGFE',
  'DEFGHIIJJIHG',
  'EFGHIIJKKJIH',
  'FGHIIJKKLKJI',
  'GHIIJKKLLKJI',
  'FGHIIJKKLKJI',
  'EFGHIIJKKJIH',
  'DEFGHIIJJIHG',
  'CDEFGHIIHGFE',
  '0CDEFGHHHGFE',
  '00CDEFGGFEDC',
  '000CDEFFEDC0',
  '0000CDEEDC00',
  '00000CDDC000',
  '000000CC0000',
  '000000000000',
  '000000000000'
];

export const PLAYER_SPRITE: PixelSprite = {
  rows: PLAYER_ROWS,
  palette: { '1': '#0B2730', '2': '#00A7B8', '3': '#00F0FF', '4': '#C9FFFF', '5': '#FFFFFF', '6': '#FF2A5F' },
};

export const BOSS_SPRITES: PixelSprite[] = [
  { rows: BOSS_A, palette: { '1': '#163448', '2': '#24536B', '3': '#387B91', '4': '#00A7B8', '5': '#00F0FF', '6': '#B6FFFF', '7': '#E8FFFF', '8': '#FF2A5F', '9': '#C51F4B', 'A': '#7B163B', 'B': '#35172F', 'C': '#FFFFFF' } },
  { rows: BOSS_B, palette: { '1': '#321B45', '2': '#5C286C', '3': '#8E3486', '4': '#C13C88', '5': '#FF2A5F', '6': '#FF6488', '7': '#FFA0BC', '8': '#FFE0EC', '9': '#6D1F64', 'A': '#F7C1FF', 'B': '#FFFFFF', 'C': '#FF174D', 'D': '#FF5A65', 'E': '#FF8A80', 'F': '#FFCDD2', 'G': '#A00045', 'H': '#780038', 'I': '#FFFFFF', 'J': '#FFFFFF' } },
  { rows: BOSS_C, palette: { '1': '#341622', '2': '#672033', '3': '#A51E43', '4': '#E52253', '5': '#FF2A5F', '6': '#FF536D', '7': '#FF8793', '8': '#FFC1C6', '9': '#FFEBEE', 'A': '#FFFFFF', 'B': '#FF174D', 'C': '#F50057', 'D': '#C51162', 'E': '#880E4F', 'F': '#5D123C', 'G': '#3B0A2D', 'H': '#FFFFFF', 'I': '#FFFFFF', 'J': '#FFFFFF', 'K': '#FFFFFF', 'L': '#FFFFFF' } },
];

export function drawPixelSprite(
  ctx: CanvasRenderingContext2D,
  sprite: PixelSprite,
  centerX: number,
  centerY: number,
  size: number,
  frame = 0,
): void {
  const rows = sprite.rows;
  const cell = size / 24;
  const offsetY = Math.sin(frame * 2.4) * 1.5;
  ctx.save();
  ctx.translate(centerX - size / 2, centerY - size / 2 + offsetY);
  for (let y = 0; y < 24; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < 12; x++) {
      const key = row[x] ?? '0';
      if (key === '0') continue;
      const color = sprite.palette[key];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
      if (x !== 11) ctx.fillRect((23 - x) * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  ctx.restore();
}
