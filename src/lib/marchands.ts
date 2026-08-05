const ZAHARA = {
  nom: 'Restaurant Zahara',
  secteur: 'Restauration',
  emoji: '🍽️',
  sheetId: process.env.SHEET_ID!,
};

export const MARCHANDS: Record<string, { nom: string; secteur: string; emoji: string; sheetId: string }> = {
  zahara: ZAHARA,
  '11111111-1111-1111-1111-111111111111': ZAHARA,
};