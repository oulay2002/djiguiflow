export type Marchand = {
  nom: string;
  secteur: string;
  emoji: string;
  sheetId: string;
  sheetCommandes: string;
  sheetMenu: string;
  groupeLivreurs: string;
  whatsapp: string;
};

const ZAHARA: Marchand = {
  nom: 'Restaurant Zahara',
  secteur: 'Restauration',
  emoji: '🍽️',
  sheetId: process.env.SHEET_ID!,
  sheetCommandes: 'Commandes_Zahara',
  sheetMenu: 'Menu',
  groupeLivreurs: '',
  whatsapp: '2250102918886',
};

const ROSE: Marchand = {
  nom: 'Rose MonDE',
  secteur: 'Mode & Accessoires',
  emoji: '🌹',
  sheetId: process.env.SHEET_ID!,
  sheetCommandes: 'Commandes_RoseMonDE',
  sheetMenu: 'Menu_RoseMonDE',
  groupeLivreurs: '',
  whatsapp: '2250708090808',
};

export const MARCHANDS: Record<string, Marchand> = {
  zahara: ZAHARA,
  '11111111-1111-1111-1111-111111111111': ZAHARA,
  rosemonde: ROSE,
  // ⚠️ Ajoute ICI le vrai UUID Supabase de Rose si sa boutique utilise un UUID dans l'URL
};