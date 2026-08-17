-- Ces deux fonctions posent le secret qui authentifie les webhooks entrants
-- d'un marchand. Creees sans REVOKE explicite, elles ont herite du droit
-- d'execution accorde par defaut a PUBLIC : n'importe qui, sans compte, pouvait
-- appeler /rest/v1/rpc/definir_secret_webhook avec le slug d'une boutique et
-- reecrire son secret — de quoi forger ses webhooks, ou simplement couper
-- l'arrivee de ses commandes.
--
-- Seul le serveur les appelle (branchement Telegram, onboarding), et il porte
-- la cle service. Leurs voisines `definir_jeton_canal`, `definir_session_wasender`
-- et `jeton_canal` etaient deja restreintes ainsi : on aligne.
revoke execute on function public.definir_secret_webhook(text, text) from public, anon, authenticated;
revoke execute on function public.definir_secret_webhook_telegram(text, text) from public, anon, authenticated;

-- Les fonctions de vitrine sont publiques a dessein, mais le droit doit etre
-- accorde nommement plutot qu'herite : on saura ainsi qui est cense les
-- appeler le jour ou la question se posera.
revoke execute on function public.vitrine_boutiques() from public;
revoke execute on function public.vitrine_boutique(text) from public;
revoke execute on function public.vitrine_produits(text) from public;
grant execute on function public.vitrine_boutiques() to anon, authenticated;
grant execute on function public.vitrine_boutique(text) to anon, authenticated;
grant execute on function public.vitrine_produits(text) to anon, authenticated;
