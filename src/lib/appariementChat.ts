import { cleAppariement } from '@/lib/telephone';

/**
 * Retrouver les commandes d'un client dont le `chat_id` a plusieurs formes.
 *
 * POURQUOI CE FICHIER EXISTE. Quatre routes appariaient un client par
 * `.eq('chat_id', …)` — `sync`, `a-noter`, `client`, `en-cours`. Le 24 aout
 * 2026 on a mesure qu'un meme client portait TROIS `chat_id` chez la meme
 * boutique. Sa note apres livraison ne retrouvait aucune commande, partait a
 * l'assistante, et lui revenait sous la forme d'un nouveau menu.
 *
 * La regle vit ICI et nulle part ailleurs. Recopiee dans quatre routes, elle
 * finirait par diverger, et l'on aurait un client retrouve par l'une et perdu
 * par l'autre — c'est la raison d'etre de `jetonSuivi.ts`, et elle vaut ici.
 *
 * CE QU'ELLE FAIT. Un seul filtre, toujours de la meme forme : l'egalite
 * stricte OU la cle des huit derniers chiffres. L'egalite reste en tete, donc
 * rien de ce qui marchait ne cesse de marcher ; la cle n'ajoute que ce qui
 * etait perdu.
 *
 * Quand l'identifiant n'a pas la forme d'un telephone ivoirien — un
 * identifiant Telegram, un groupe — `cleAppariement` ne rend rien et le
 * filtre se reduit a l'egalite stricte. Ces identifiants-la sont deja
 * stables : les elargir n'apporterait rien et ouvrirait des confusions.
 */

/**
 * Echappement pour un filtre PostgREST.
 *
 * Les valeurs voyagent dans une chaine ou la virgule et la parenthese sont
 * des separateurs. Un `chat_id` porte parfois un suffixe
 * (`…@s.whatsapp.net`) et rien ne garantit ce qui arrivera demain : on cite
 * la valeur plutot que de parier sur son alphabet.
 */
function citer(valeur: string): string {
  return `"${valeur.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Rend l'argument a passer a `.or()` de Supabase.
 *
 * Toujours non vide : avec un seul terme quand il n'y a pas de cle, ce qui
 * laisse UN SEUL chemin de code dans les routes. Deux chemins, c'est un
 * chemin qu'on oublie de corriger.
 */
export function filtreAppariementChat(chatId: string): string {
  const exact = `chat_id.eq.${citer(chatId)}`;
  const cle = cleAppariement(chatId);
  if (!cle) return exact;
  return `${exact},chat_cle.eq.${citer(cle)}`;
}
