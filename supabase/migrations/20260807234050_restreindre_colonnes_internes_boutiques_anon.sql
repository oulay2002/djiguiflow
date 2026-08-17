-- La policy `public_read_boutiques` ouvre la table aux visiteurs anonymes
-- (vitrine /boutiques). RLS filtre les LIGNES, jamais les COLONNES : les
-- identifiants d'integration partaient donc avec la fiche publique.
--
-- sheet_commandes / sheet_menu : onglets du classeur Google du marchand.
-- groupe_livreurs : identifiant du groupe WhatsApp de livraison.
--
-- Retire a `anon` seulement. `authenticated` les conserve (la page
-- Ma Boutique fait un select('*') sur sa propre ligne), et `service_role`
-- n'est pas concerne par les GRANT de colonnes.
revoke select (sheet_commandes, sheet_menu, groupe_livreurs)
  on public.boutiques
  from anon;
