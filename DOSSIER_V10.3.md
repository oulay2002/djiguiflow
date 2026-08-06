# 🌍 DJIGUIFLOW — DOSSIER v10.3
### La doctrine multi-tenant : qui touche quoi
*Août 2026 · Zahara (réel) + Rose MonDE (tenant de test)*

---

## 1. 🎯 LA RÉVÉLATION FONDAMENTALE

**Google Sheets n'est PAS un outil du marchand. C'est le moteur interne de la
plateforme — invisible, côté admin.** Comme la base de données d'Uber : aucun
chauffeur ne voit la base de données d'Uber.

Le marchand n'a besoin de **rien** : ni ordinateur, ni Google Sheet, ni technique.
Il vit sur **WhatsApp** (son téléphone) et voit sa boutique dans l'app.

---

## 2. 👥 3 ACTEURS, 3 INTERFACES

| Acteur | Son outil | Voit Google Sheets ? |
|---|---|---|
| **Client** | App / WhatsApp pour commander | ❌ Jamais |
| **Marchand** | WhatsApp (commandes) + dashboard mobile (menu, stats) | ❌ **Jamais** |
| **Admin DjiguiFlow** | Dashboard (provisioning, pilotage global) | ✅ C'est SA base interne |

---

## 3. 🚪 ONBOARDING D'UNE BOUTIQUE QUI S'ABONNE

1. Le marchand s'inscrit (formulaire WhatsApp ou lien simple)
2. **L'admin** clique « **+ Ajouter un marchand** » dans son dashboard
3. Le système **crée tout seul** : ses onglets + sa ligne de registre + sa fiche boutique
4. Le marchand reçoit : « Bienvenue sur DjiguiFlow ! Vos commandes arrivent ici. » 📲
5. Il gère tout depuis son téléphone (commandes WhatsApp, menu via dashboard mobile)

**Ajouter un marchand = 1 ligne de registre + des onglets. Zéro webhook nouveau,
zéro code.** C'est la différence entre un site et une plateforme.

---

## 4. 🏗️ LE PATTERN MULTI-TENANT : 1 WEBHOOK + 1 REGISTRE

Un seul tuyau générique ; c'est la **CONFIG** qui change par marchand :

```
Webhook UNIQUE « commande-app »
        │  reçoit { boutique_id, ... }
        ▼
Node « Charger config » → lit le REGISTRE Marchands
        │  (sheetCommandes, sheetMenu, groupeLivreurs, whatsapp)
        ▼
Mêmes nodes pour TOUS : écrire → alerter livreurs → notifier client
```

### Registre `Marchands` (clé de voûte)
| id | nom | sheetCommandes | sheetMenu | groupeLivreurs | whatsapp |
|---|---|---|---|---|---|
| zahara | Zahara | Commandes_Zahara | Menu | <jid> | 225… |
| rosemonde | Rose MonDE | Commandes_RoseMonDE | Menu_RoseMonDE | <jid> | 225… |

### Exception WhatsApp
1 numéro WhatsApp = 1 boutique (branchement physique WasenderAPI).
Le canal **App** est multi-tenant natif.

---

## 5. 🔐 RÈGLES D'OR (héritées v8/v9)

1. Tout numéro → normalisé `225…`
2. La feuille = vérité · n8n écrit, l'app lit
3. Ne jamais casser la conversation (try/catch)
4. `api/` = tuyaux · `app/` = écrans
5. La boîte noire (`Logs_Envois`) d'abord en cas de bug

---

## 6. 🧠 LEÇONS n8n (rappel)

- `message.sent` vs reçu · `fromMe` · point orange Publish
- `$json` = node précédent · webhook body dans `$json.body`
- Code `[]` stoppe le flux · Sheets 0 ligne = porte bloquante

---

## 7. 🗺️ ROADMAP

- **v10.2** : webhook générique (testé sur Rose, puis bascule Zahara)
- **v10.3** : bouton « + Ajouter un marchand » (auto-provisioning)
- **v11** : suivi temps réel WebSocket
- **v12** : dashboard marchand sur mobile (le marchand gère son menu seul)

*« Tu provisionnes, le marchand vit sur WhatsApp. » — DjiguiFlow* 🤝