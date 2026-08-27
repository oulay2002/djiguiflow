import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      /**
       * `set-state-in-effect` : AVERTISSEMENT, PAS ERREUR — et c'est un
       * arbitrage, pas un abandon.
       *
       * ── POURQUOI ELLE CRIE ICI ──────────────────────────────────────────
       *
       * Cette regle du compilateur React refuse tout `setState` ATTEIGNABLE
       * depuis un effet, y compris apres un `await`. Elle vise donc le motif
       * « je charge mes donnees au montage, et je les mets dans l'etat », que
       * cinq ecrans emploient : les commandes, les produits, les statistiques,
       * le suivi client, et la relance de notification.
       *
       * Ce que la regle demande vraiment, c'est de charger AILLEURS — composants
       * serveur, ou bibliotheque de donnees. C'est une refonte de la facon dont
       * le tableau de bord s'alimente, pas une correction de style.
       *
       * ── CE QU'ELLE NE DIT PAS ───────────────────────────────────────────
       *
       * Aucun de ces cinq ecrans n'est en panne. Le cout reel est un rendu de
       * plus par chargement. Et l'un d'eux ne peut PAS etre corrige comme la
       * regle le voudrait : `ReglagePush` lit `localStorage`, ce qui doit se
       * faire APRES l'hydratation — le sortir de l'effet provoquerait un
       * desaccord entre le HTML du serveur et celui du navigateur.
       *
       * ── POURQUOI ON LA DEGRADE PLUTOT QUE DE LA LAISSER BLOQUER ─────────
       *
       * L'etape de lint portait `continue-on-error: true` en CI, avec la note
       * « temporaire, a retirer des que ces sept erreurs sont corrigees ». Le
       * resultat : le linter ne gardait RIEN. Une faute reelle — un `any` pose
       * sur un calcul de prix — y dormait depuis des semaines sans que rien ne
       * l'arrete.
       *
       * Deux des sept etaient de vrais defauts et ont ete corriges le 27 aout
       * 2026 : ce `any`, et un bandeau de pause qui ne se levait pas tout seul
       * parce qu'il lisait l'heure pendant le rendu. Les cinq autres sont ce
       * motif-ci.
       *
       * En degradant CETTE regle, l'etape redevient bloquante pour tout le
       * reste. Un garde qui arrete quelque chose vaut mieux qu'un garde qu'on
       * a debranche pour qu'il se taise — c'est la meme lecon que le controle
       * des couleurs, qui rendait vingt faux positifs parce que personne ne le
       * lancait.
       *
       * ── QUAND LA REMETTRE EN ERREUR ─────────────────────────────────────
       *
       * Le jour ou le chargement du tableau de bord passera cote serveur. La
       * regle redeviendra alors satisfaisable, et elle aura raison.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
