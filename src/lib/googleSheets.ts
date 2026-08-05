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