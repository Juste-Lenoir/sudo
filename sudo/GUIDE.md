# sudo_ : guide de mise en route

sudo_ tourne entièrement dans le navigateur : pas de serveur à gérer, pas d'abonnement. Tes ateliers, tes photos et tes clés restent sur ton appareil.

## Ce qu'il y a dans la Phase 1

| Écran | À quoi ça sert |
|---|---|
| **Ateliers** | Consigne en photo, dictée ou texte → points à clarifier (coquilles, termes flous), plan d'étapes, relevés à noter. 3 vues : **Établi** (plan + outils), **Focus** (une étape en grand), **Conversation** (l'assistant valide les étapes et remplit les relevés tout seul). Compte rendu de TP et fiches pour le carnet. |
| **Vérification** | Le formateur qui passe à ton poste : questions ouvertes ou QCM, note sur 20, séries illimitées, questions ratées qui reviennent reformulées, progression. |
| **Photo** | Identifier composants, câbles et ports ; « je le branche où ? » ; « par où commencer ? ». Photo annotée avec étiquettes déplaçables. |
| **Assistant** | Question libre, Guide, Explication, Simulateur de panne, Examen oral. Bouton **2ᵉ avis** et mode **Côte à côte** (2 ou 3 IA en même temps). |
| **Badge en haut** | L'IA utilisée et ce qu'il lui reste aujourd'hui. Un clic : la consommation des 3 IA les plus utilisées. |

Raccourcis sur ordinateur : `N` nouvel atelier, `P` photo, `Ctrl+K` / `⌘K` assistant.

---

## Étape 1 : mettre l'app en ligne (gratuit, une seule fois)

Pour l'ouvrir sur ton iPhone, ton Android et tes ordinateurs, l'app doit avoir une adresse web. Le plus simple est **GitHub Pages**.

1. Crée un compte gratuit sur **github.com**.
2. En haut à droite : **+** → **New repository**.
   - Nom : `sudo`
   - Coche **Public** (obligatoire pour GitHub Pages gratuit ; tes données ne sont pas dans le dépôt, elles restent sur tes appareils).
   - **Create repository**.
3. Sur la page du dépôt, clique **uploading an existing file**.
4. Glisse **tout le contenu** du dossier `sudo` (les fichiers et les dossiers `css`, `js`, `icons`, `vendor`, `dev`), puis **Commit changes**.
5. **Settings** → **Pages** → Source : **Deploy from a branch**, Branch : **main**, dossier **/ (root)** → **Save**.
6. Attends 1 à 2 minutes : ton adresse s'affiche, du type `https://ton-pseudo.github.io/sudo/`.

> Sans GitHub : **Cloudflare Pages** ou **Netlify** acceptent un simple glisser-déposer du dossier.

## Étape 2 : installer l'app

- **iPhone** : ouvre l'adresse dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
- **Android** : ouvre l'adresse dans **Chrome** → menu **⋮** → **Installer l'application**.
- **Ordinateur** (Chrome ou Edge) : icône **Installer** dans la barre d'adresse.

## Étape 3 : connecter une IA gratuite (2 minutes)

1. Va sur **aistudio.google.com/apikey** avec un compte Google → **Create API key** → copie la clé.
2. Dans sudo : **Réglages** → **Google Gemini** → colle la clé → **Tester**.
3. Conseillé : ajoute **Groq** (console.groq.com/keys). Elle est très rapide, sert pour les petites tâches et le 2ᵉ avis, et prend le relais si Gemini n'a plus de quota.

Si un modèle ne répond plus (les fournisseurs les renomment), clique **Lister** à côté du champ Modèle et choisis-en un autre.

## Essayer sans clé : le mode démo

Ajoute `?demo` à l'adresse (ex. `https://ton-pseudo.github.io/sudo/?demo`). sudo utilise alors des réponses préparées sur l'atelier VMware, sans appeler aucune IA : pratique pour découvrir l'app. Les réponses ne sont pas réelles.

## Passer d'un appareil à l'autre (en attendant la Phase 3)

**Réglages** → **Exporter** → envoie le fichier par AirDrop, e-mail ou clé USB → sur l'autre appareil, **Importer**. Les clés ne sont incluses que si tu coches la case (garde alors ce fichier pour toi).

## Mettre à jour l'app

Remplace les fichiers modifiés dans GitHub (**Add file** → **Upload files**), et change le numéro dans `sw.js` (`sudo-v1` → `sudo-v2`…) pour que les téléphones prennent la nouvelle version.

## Bon à savoir

- Les IA se trompent parfois, surtout sur les commandes, les versions et la position exacte des étiquettes sur une photo. Utilise le **2ᵉ avis** ou le **Côte à côte**, et vérifie dans la documentation officielle.
- Les limites gratuites affichées sont des estimations (sauf quand le fournisseur les donne, comme Groq) ; corrige-les dans Réglages si elles changent.
- Ollama (IA locale) ne marche que sur l'ordinateur où il est installé.
