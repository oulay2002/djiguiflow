import { JWT } from 'google-auth-library';

const auth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export async function readSheet(
  range: string,
  sheetId: string = process.env.SHEET_ID!,
): Promise<Record<string, string>[]> {
  const token = await auth.getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const rows: string[][] = data.values ?? [];
  const [headers, ...body] = rows;
  if (!headers) return [];
  return body.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
export async function readHeaders(range: string, sheetId: string = process.env.SHEET_ID!): Promise<string[]> {
  const token = await auth.getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.values?.[0] ?? []) as string[];
}

export async function appendRow(range: string, row: string[], sheetId: string = process.env.SHEET_ID!) {
  const token = await auth.getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
/** Titres des onglets presents dans le classeur. */
export async function listerOnglets(sheetId: string = process.env.SHEET_ID!): Promise<string[]> {
  const token = await auth.getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.sheets ?? []).map((s: { properties?: { title?: string } }) => s.properties?.title ?? '');
}

/**
 * Cree un onglet et y ecrit sa ligne d'en-tetes.
 *
 * Idempotent : si l'onglet existe deja, il est laisse intact (on ne reecrit
 * pas les en-tetes, ce qui ecraserait une feuille en production).
 *
 * @returns true si l'onglet a ete cree, false s'il existait deja.
 */
export async function creerOnglet(
  titre: string,
  entetes: string[],
  sheetId: string = process.env.SHEET_ID!,
): Promise<boolean> {
  if ((await listerOnglets(sheetId)).includes(titre)) return false;

  const token = await auth.getAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: titre } } }] }),
    },
  );
  if (!res.ok) throw new Error(await res.text());

  if (entetes.length) await updateCells(`${titre}!A1`, [entetes], sheetId);
  return true;
}

export async function updateCells(range: string, values: string[][], sheetId: string = process.env.SHEET_ID!) {
  const token = await auth.getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}