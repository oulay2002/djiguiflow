# 🌍 DJIGUIFLOW — DOSSIER v8
### La plateforme de commerce local à 3 canaux
*Restaurant Zahara — premier commerçant vivant · Août 2026*

---

## 1. 🎯 LA VISION

DjiguiFlow connecte les commerçants africains à leurs clients là où ils vivent déjà :
**WhatsApp, Telegram, et maintenant le Web.** Une seule vérité opérationnelle,
trois fenêtres pour la vivre. Le client commande, suit, note — le commerçant
pilote, livre, encaisse. **Deux mondes, un seul système.**

---

## 2. 🏗️ L'ARCHITECTURE (qui fait quoi)

| Couche | Outil | Rôle | Règle |
|---|---|---|---|
| Vérité opérationnelle | **Google Sheets** | Commandes, Menu, Logs, Notes | n8n écrit, on lit. Jamais l'inverse. |
| Annuaire & auth | **Supabase** | boutiques, produits, commerçants | On ajoute les commerçants ici. |
| Cerveau qui agit | **n8n** | Workflows multi-canaux, livraison, notifs | Un seul cerveau, 3 canaux. |
| Pont lisible | **Next.js** | App, boutique, suivi, dashboard | Rend le vivant consultable. |
| Passerelle WhatsApp | **WasenderAPI** | Envoi/réception WhatsApp | JID = format `225…` obligatoire. |
| Passerelle Telegram | **Telegram Bot** | Envoi/réception Telegram | Le bot n'est jamais "fromMe". |

---

## 3. 🌉 LES 3 CANAUX (une colonne vertébrale)

```
├── 📲 WhatsApp visiteur → Routeur WhatsApp → Cerveau Zahara → Livraison + Réponse client
├── ✈️ Telegram visiteur  → Routeur Telegram → Cerveau Zahara → Livraison + Réponse client
└── 🌐 App visiteur       → Next.js /commander → Webhook n8n "Commande App"
                                                 ├→ Notifier client (WhatsApp)
                                                 └→ Alerter livreurs (groupe + boutons)
```

**Principe** : quel que soit le canal d'entrée, la commande finit dans
`Commandes_Zahara` et déclenche **les mêmes robots** (livraison, notification, notation).

---

## 4. 📊 GOOGLE SHEETS — la source de vérité

### `Commandes_Zahara` (colonnes)
`chat_id · customer_name · phone · address · instruction · items · total_price ·
status · order_id · canal · timestamp · nom_livreur · heure_prise_en_charge ·
statut_livraison · position_livreur · heure_livraison`

### `Menu` (colonnes)
`id · nom · categorie · prix · description · disponible · image`
→ **La feuille Menu reste la source de vérité** : changer une photo = changer une cellule, zéro code.

### `Logs_Envois` — la boîte noire 🖤
Chaque envoi WhatsApp/Telegram journalisé : `timestamp · canal · destinataire ·
message · statut (OK/ERREUR) · erreur`. **Toujours consulter en premier quand ça casse.**

---

## 5. 🗄️ SUPABASE — l'annuaire

- `boutiques` : `id (uuid) · nom · categorie · telephone · whatsapp`
- `produits` : `id · boutique_id · nom · categorie · prix · description · image_url`

**Hybridation** : la page `/boutiques/[id]` lit le Menu **Sheets** si le marchand est
dans `MARCHANDS`, sinon **Supabase + WhatsApp** (`wa.me`). Deux moteurs, une page.

---

## 6. 🔐 RÈGLES D'OR (gravées dans le marbre)

1. **Tout numéro qui entre → normalisé `225…`**
   ```js
   let phone = String(tel||'').replace(/\D/g,'');
   if (!phone.startsWith('225')) phone = '225' + phone;
   ```
2. **La feuille = vérité.** n8n écrit, Next.js lit. Jamais écrire depuis l'app.
3. **Ne jamais casser la conversation.** Tout appel n8n dans un `try/catch`.
4. **`api/` = les tuyaux (`route.ts`) · `app/` = les écrans (`page.tsx`).** Jamais un écran dans un tuyau.
5. **La boîte noire d'abord.** En cas de bug, lire `Logs_Envois` avant de toucher au code.

---

## 7. 🧠 LEÇONS n8n (payées en sueur)

| Leçon | Détail |
|---|---|
| `message.sent` vs reçu | Un message **sortant** (du téléphone connecté) arrive sans `messageBody` → invisible. Seuls les messages **entrants** portent le texte. |
| `fromMe` | Les messages du téléphone connecté sont ignorés, **sauf** commandes `/…` et notes `1-5` (exception codée dans le Normalisateur WA). |
| Point orange Publish | = modifications **non publiées**. Le webhook de production tourne sur la dernière version **PUBLIÉE**, pas celle de l'éditeur. |
| `$json` | = données du node **précédent**. Pour remonter à la source : `$('NomDuNode').first().json` ou un node **Set** qui fige les données. |
| Webhook body | Les champs sont **dans `body`** : `$json.body.phone`, pas `$json.phone`. |
| `$now.setTimeZone` | **N'existe pas.** Abidjan = UTC+0 → `new Date().toISOString()`. |
| Code qui renvoie `[]` | **Stoppe tout le flux** en aval. |
| Lecture Sheets = 0 ligne | **Porte bloquante** : rien ne s'exécute après. Contourner par un `If` amont (ex: "Commande admin ?"). |

---

## 8. 📁 FICHIERS CLÉS (Next.js)

```
src/lib/googleSheets.ts        → readSheet / readHeaders / appendRow (clés = en-têtes exacts)
src/lib/marchands.ts           → registre MARCHANDS (multi-commerçants)
src/lib/supabase.ts            → client Supabase
src/app/api/boutiques/[id]/menu/route.ts        → Menu (Sheets ou Supabase)
src/app/api/boutiques/[id]/commander/route.ts   → écrit Commandes + webhook n8n + normalisation 225
src/app/api/suivi/route.ts     → lit le statut par order_id (timeline)
src/app/boutiques/page.tsx     → annuaire des boutiques
src/app/boutiques/[id]/page.tsx→ boutique hybride + panier + retour + poursuivre
src/app/suivi/page.tsx         → timeline de suivi (refresh 15 s)
src/app/dashboard/commandes/page.tsx → dashboard gérant (données réelles)
```

---

## 9. ⚙️ VARIABLES D'ENVIRONNEMENT (.env.local)

```
GOOGLE_CLIENT_EMAIL=…
GOOGLE_PRIVATE_KEY=…          (avec \n échappés)
SHEET_ID=…                    (doc Restaurant Zahara)
SUPABASE_URL=…
SUPABASE_ANON_KEY=…
N8N_COMMANDE_APP_URL=https://oulai2002.app.n8n.cloud/webhook/commande-app
```

---

## 10. 🗺️ PROCHAINES ÉTAPES (roadmap)

- **v9** : Dashboard commerçant (`/CA`, nb commandes, note moyenne)
- **v10** : Onboarder **Rose MonDE** de bout en bout (preuve que ça scale)
- **v11** : Suivi temps réel WebSocket (remplacer le refresh 15 s)
- **v12** : Auth JWT du dashboard (déjà préparée)

---

*« Deux mondes, une seule vérité. » — DjiguiFlow, août 2026* 🤝