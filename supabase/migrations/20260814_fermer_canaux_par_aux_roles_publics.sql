-- Les trois fonctions canaux_par_* etaient appelables par `anon`, donc par
-- quiconque possede la cle publique Supabase — celle qu'embarque le navigateur
-- de chaque page vitrine. Un appel a /rest/v1/rpc/canaux_par_slug rendait le
-- telephone du gerant, son chat Telegram, le groupe de ses livreurs et le nom
-- de ses feuilles. canaux_par_commande etait pire encore : la reference d'une
-- commande est communiquee au client, qui pouvait donc s'en servir comme cle.
--
-- Elles sont SECURITY DEFINER a dessein : elles doivent lire les boutiques
-- par-dessus la RLS. Mais leur seul appelant legitime est l'application, qui
-- passe par le role de service (SUPABASE_SERVICE_ROLE_KEY, cf.
-- src/lib/supabaseAdmin.ts). On calque donc jeton_canal, deja durcie.
--
-- Les fonctions vitrine_* gardent volontairement leur acces public : c'est par
-- elles que la vitrine s'affiche, connecte ou non. Voir la note memoire
-- « RLS : lecture publique = anon seulement ».

revoke execute on function public.canaux_par_commande(text) from public, anon, authenticated;
revoke execute on function public.canaux_par_session(text)  from public, anon, authenticated;
revoke execute on function public.canaux_par_slug(text)     from public, anon, authenticated;

grant execute on function public.canaux_par_commande(text) to service_role;
grant execute on function public.canaux_par_session(text)  to service_role;
grant execute on function public.canaux_par_slug(text)     to service_role;
