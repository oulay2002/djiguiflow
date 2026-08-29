-- L'identifiant de la session wasender, pour pouvoir la retrouver.
--
-- POURQUOI UNE COLONNE NEUVE. `wasender_session_hash` existe deja — mais elle
-- porte un sha256 (64 caracteres hexadecimaux), pas un identifiant. Y ranger
-- un id en clair ferait mentir son nom, et le prochain a le lire croirait
-- manipuler une empreinte. Un nom qui ment coute plus cher qu'une colonne.
--
-- A QUOI ELLE SERT. Le branchement en libre-service cree la session chez
-- wasender, qui rend un `id`. Il faut le garder pour trois choses :
--   - afficher le QR code (`GET /api/whatsapp-sessions/{id}/qrcode`) ;
--   - suivre la connexion ;
--   - LIBERER LA PLACE quand un marchand s'en va (`DELETE`), ce qui compte
--     avec un forfait plafonne a dix sessions.
--
-- ELLE N'EST PAS UN SECRET. L'identifiant seul n'ouvre rien : les appels
-- exigent le jeton de compte, qui vit dans les variables d'environnement. Elle
-- est neanmoins retiree des reponses publiques, comme ses voisines — on
-- n'expose pas la plomberie d'un marchand.

alter table public.boutiques
  add column if not exists wasender_session_id text;

comment on column public.boutiques.wasender_session_id is
  'Identifiant de la session chez wasender. Sert au QR, au suivi, et a liberer la place. Pas un secret.';
