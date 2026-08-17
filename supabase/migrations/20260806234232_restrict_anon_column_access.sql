-- RLS filtre les LIGNES, pas les COLONNES : la policy public_read_boutiques
-- (qual = true) exposait au role anon la config interne du registre
-- (sheet_commandes, sheet_menu, groupe_livreurs) et le user_id proprietaire.
-- Le cloisonnement par colonne passe par les privileges.
revoke select on public.boutiques from anon;
grant select (id, slug, nom, description, logo_url, zone, categorie, emoji, telephone)
  on public.boutiques to anon;

-- Meme logique pour la vitrine : le menu est public, les niveaux de stock
-- et les seuils d'alerte sont de l'information commerciale interne.
revoke select on public.produits from anon;
grant select (id, boutique_id, nom, description, photo_url, prix, categorie, disponible, menu_du_jour)
  on public.produits to anon;
