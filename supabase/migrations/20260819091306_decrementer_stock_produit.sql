-- Retire du stock ce qui vient d'etre commande, sans jamais passer sous zero.
--
-- POURQUOI UNE FONCTION ET PAS UN UPDATE DEPUIS LE CODE. Le client Supabase ne
-- sait pas ecrire « stock = stock - 2 » : il faudrait lire, soustraire, puis
-- ecrire. Deux commandes simultanees liraient alors la meme valeur et
-- ecriraient la meme, donc un seul des deux plats serait decompte. Ici la
-- soustraction se fait DANS la base, en une instruction, et deux appels
-- concurrents se suivent au lieu de se doubler.
--
-- `stock is not null` : un marchand qui ne compte pas ses plats n'est pas
-- concerne, et son NULL ne doit pas devenir un zero au premier achat.
--
-- `greatest(0, ...)` : le stock ne descend pas sous zero meme si un decompte
-- arrive en double. Mieux vaut un stock un peu optimiste qu'un nombre negatif
-- que personne ne sait interpreter.

create or replace function public.decrementer_stock(p_produit uuid, p_quantite integer)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.produits
     set stock = greatest(0, stock - greatest(0, p_quantite))
   where id = p_produit
     and stock is not null
  returning stock;
$$;

-- SECURITY DEFINER N'EST PAS UNE RESTRICTION, c'est le contraire : sans ces
-- REVOKE, n'importe quel visiteur de la vitrine pourrait vider le stock d'un
-- marchand en appelant la fonction avec la cle anonyme. Seul le serveur, qui
-- porte la cle service_role, doit pouvoir la nommer.
revoke all on function public.decrementer_stock(uuid, integer) from public;
revoke all on function public.decrementer_stock(uuid, integer) from anon;
revoke all on function public.decrementer_stock(uuid, integer) from authenticated;
grant execute on function public.decrementer_stock(uuid, integer) to service_role;
