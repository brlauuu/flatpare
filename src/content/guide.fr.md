# Guide d’utilisation de Flatpare

Flatpare aide un foyer à comparer des appartements ensemble. Ajoute des annonces en PDF, évalue-les et vois tout côte à côte — avec tes données chiffrées dans ton navigateur avant d’être enregistrées.

---

## Premiers pas

### 1. Se connecter

Connecte-toi avec Google ou avec un lien envoyé à ton adresse e-mail, ou avec le mot de passe partagé de ton foyer si ton Flatpare est configuré ainsi. Indique ton nom sur la page Réglages pour que chacun sache qui a dit quoi ; tant que tu ne l’as pas fait, ton foyer voit ton adresse e-mail sur tes évaluations.

### 2. Choisir une phrase secrète

À ta première connexion, Flatpare te demande de **choisir une phrase secrète** (au moins 12 caractères). Ce n’est pas une deuxième connexion : c’est la clé qui chiffre les appartements, les évaluations et les notes de ton foyer dans ton navigateur.

**Flatpare ne voit jamais cette phrase secrète et ne peut pas la réinitialiser pour toi.** C’est tout l’intérêt : c’est ce qui empêche quiconque fait tourner le serveur, nous compris, de lire ta recherche.

Elle te sera redemandée sur chaque nouvel appareil ou navigateur que tu utilises, et après avoir verrouillé Flatpare.

### 3. Conserver ton kit de récupération

Juste après avoir choisi ta phrase secrète, un **code de récupération de 25 caractères t’est affiché, une seule fois**. Note-le ou imprime-le, et garde-le en lieu sûr.

> **C’est l’écran le plus important de Flatpare.** Le code de récupération est le seul moyen de revenir si tu oublies ta phrase secrète. Si tu perds les deux, les données de ton foyer sont perdues définitivement — personne ne peut les récupérer, parce que personne d’autre n’a jamais eu la clé.

Traite-le comme une clé de maison, pas comme un indice de mot de passe. Une copie imprimée dans un tiroir convient très bien. Une note dans le même gestionnaire de mots de passe que tout le reste sert moins si tu perds l’accès à celui-ci.

### 4. Rejoindre un foyer créé par quelqu’un d’autre

Si tu as été invité·e dans un foyer existant, tu choisis ta propre phrase secrète de la même façon, puis tu vois **« Presque prêt »**.

Flatpare attend que quelqu’un qui fait déjà partie du foyer ouvre l’application — à ce moment-là, son navigateur transmet automatiquement au tien une copie de la clé du foyer. **Cette personne n’a rien à faire**, mais elle doit ouvrir Flatpare au moins une fois. L’écran vérifie à nouveau toutes les quelques secondes et passe à la suite tout seul.

### 5. Ajouter un appartement

Va sur **Ajouter** dans la barre de navigation et glisse (ou sélectionne) une annonce en PDF. Si l’extraction par IA est configurée, Flatpare en tire :

- Nom/titre de l’appartement
- Adresse
- Surface (m²), pièces, salles de bain, balcons
- Loyer mensuel, dans la devise de l’annonce

Si aucune IA n’est configurée, remplis les champs à la main. Dans les deux cas, tu arrives sur la page de l’appartement pour vérifier et corriger ce qui serait faux — l’extraction est un point de départ, pas un oracle.

Tu peux aussi ajouter un appartement à la main, sans PDF ni adresse. Tant qu’il n’a ni l’un ni l’autre, il est **non traité** : note-le et remplis ce que tu sais. Dès qu’il reçoit une adresse ou un PDF, Flatpare le place sur la carte et mesure ses distances.

### 6. Évaluer les appartements

Sur la page de chaque appartement, évalue-le selon cinq catégories :

| Catégorie | À prendre en compte |
|----------|-----------------|
| **Cuisine** | Taille, équipement, agencement, lumière naturelle |
| **Balcons** | Taille, vue, intimité, ensoleillement |
| **Situation** | Quartier, bruit, commerces, parcs |
| **Plan** | Répartition des pièces, circulation, rangements, côté pratique |
| **Impression générale** | Ton ressenti après la visite |

Clique sur une étoile pour donner une note (1-5) ; clique à nouveau sur la même étoile pour l’effacer. Tu évalues de ton côté — chaque membre du foyer évalue séparément, et la comparaison montre les notes côte à côte au lieu de lisser un désaccord dans une moyenne.

### 7. Comparer

Va sur **Comparer** pour voir tous les appartements dans un seul tableau. La meilleure valeur de chaque ligne est mise en évidence (loyer le plus bas, meilleure note, trajet le plus court). Fais défiler horizontalement s’il y a plus d’appartements que la largeur ne le permet. Les loyers dans des devises différentes ne sont pas convertis : le plus bas est mis en évidence dans chaque devise, et le tri par prix montre d’abord les francs, puis chaque autre devise.

---

## Fonctionnalités

### Lieux importants

Sur la page **Foyer**, enregistre jusqu’à **cinq** endroits où tu vas vraiment — le travail, la salle de sport, ta sœur. Chaque appartement indique alors combien de temps il faut pour s’y rendre à vélo et en transports publics.

C’est à toi de les choisir ; Flatpare ne suppose pas où tu te déplaces.

### Distances

Les temps de trajet sont mesurés depuis chaque appartement jusqu’à chacun de tes lieux enregistrés :

- **Vélo** — via Google Maps ou OpenRouteService
- **Transports publics** — via Google Maps (non disponible avec OpenRouteService)

Si aucune API de distances n’est configurée, tu peux saisir les temps à la main.

Changer plus tard l’adresse d’un appartement ne remesure rien tout seul : ses distances sont masquées jusqu’à ce que tu appuies sur **Retraiter** sur sa page. Sur la version hébergée, un retraitement utilise un crédit d’appartement, tout comme **Tout recalculer** sur la page Foyer, une fois pour tout le calcul. Ajouter ou modifier un lieu est gratuit.

### Gestion des PDF

- Ajout d’un seul fichier ou de plusieurs à la fois
- **Les PDF sont chiffrés dans ton navigateur avant d’être envoyés.** Ce qui est enregistré, c’est du texte chiffré ; en ouvrir un le déchiffre à nouveau sur ton appareil
- L’extraction utilise Gemini 2.5 Flash. Sur flatpare.com, elle passe uniquement par des fournisseurs de modèles qui garantissent zéro conservation des données : la requête n’est pas gardée une fois traitée

### Ce que le serveur peut voir

Rien de ce que contient ta recherche : tes appartements, tes évaluations, tes notes et tes PDF sont chiffrés avant de quitter ton navigateur. Ce qu’il voit, c’est ce dont il a besoin pour séparer les ménages et facturer le traitement : ton compte (adresse e-mail et nom que tu as choisi), qui fait partie de ton ménage, combien d’appartements, d’évaluations et de lieux tu as et quand ils ont changé, et **combien de PDF, d’adresses et de liens d’annonces ton ménage a fait traiter, et ce que chaque crédit a payé**. Ces comptes sont tenus par ménage, jamais par personne, et ne disent jamais ce qui a été traité. Sur flatpare.com, nous les examinons pour vérifier l’utilisation par rapport à ce qui a été payé.

Il y a une exception voulue, et elle mérite d’être connue : **géolocaliser une adresse, mesurer un temps de trajet, vérifier qu’une annonce est toujours en ligne et lire un PDF** ne peuvent pas se faire dans ton navigateur. Pour cela, l’élément concerné, et lui seul, est envoyé en clair : une adresse à Google Maps (ou à OpenRouteService sur certaines installations auto-hébergées) pour sa position et les temps de trajet, l’URL d’une annonce que notre serveur va chercher directement sur le site de l’annonce, et un PDF au modèle d’IA qui le lit. Notre serveur s’en sert pour cette seule requête, ne l’écrit jamais dans la base de données et ne l’enregistre jamais dans les journaux. Quand un PDF n’a pas de lien valable vers son annonce, le modèle d’IA la cherche aussi sur le web, avec le titre, l’adresse, le site et la langue de l’annonce ; sur flatpare.com, cette recherche ne conserve rien de la requête. Un lien trouvé ainsi est signalé comme résultat de recherche, pour que tu puisses le vérifier avant d’enregistrer.

### Gérer ta clé

Dans **Réglages**, tu peux :

- **Verrouiller cet appareil** — efface la clé de ce navigateur sans te déconnecter. Pratique sur un ordinateur partagé ou emprunté ; il te faudra ta phrase secrète pour déverrouiller à nouveau.
- **Changer la phrase secrète** — conserve tes données et protège à nouveau la clé avec une nouvelle phrase secrète.
- **Régénérer le kit de récupération** (propriétaires du foyer uniquement) — émet un nouveau code de récupération et rend l’ancien invalide. Fais-le si tu penses que quelqu’un d’autre a vu la copie imprimée. Les autres propriétaires en sont informés sur la page Foyer, car leur copie cesse aussi de fonctionner.

### Sauvegarder tes données

Comme tes données sont chiffrées, personne ne peut les restaurer pour toi, pas même nous. Sur la page **Foyer**, sous **Tes données**, chaque membre peut **exporter** tout le foyer dans un fichier ZIP : appartements, évaluations, lieux et PDF originaux, plus un fichier tableur. **Le fichier n'est pas chiffré**, garde-le donc dans un endroit privé.

Pour récupérer un export, ouvre la page Foyer d'un foyer qui n'a encore ni appartements ni lieux, et choisis **Importer**. Les évaluations des autres personnes sont ajoutées à tes propres commentaires, avec leur nom. Une importation n’appelle aucun service extérieur et n’utilise aucun crédit d’appartement.

---

## Sur ton téléphone

Flatpare fonctionne dans le navigateur de ton téléphone. Tu peux aussi l'installer : il s'ouvre alors comme une app, depuis sa propre icône.

### Installer Flatpare

- **Android :** ouvre le menu sous ton nom et choisis **Installer l'app**, ou touche **Installer** dans l'astuce en haut de la page Appartements.
- **iPhone et iPad :** touche le bouton Partager, choisis **Sur l'écran d'accueil**, puis **Ajouter**. **Installer l'app** dans le menu sous ton nom montre les mêmes étapes.

### Partager des annonces vers Flatpare (Android)

Une fois Flatpare installé sur Android, il apparaît dans le menu de partage de ton téléphone. Partage un PDF depuis tes fichiers ou ton e-mail : Flatpare te demande s'il faut l'ajouter, puis le lit comme n'importe quel ajout. Partage un lien depuis ton navigateur ou une app d'annonces : Flatpare l'ajoute comme appartement pas encore traité, puis l'ouvre.

Si tu es déconnecté ou si Flatpare est verrouillé au moment du partage, l'élément attend un jour sur ton téléphone. Connecte-toi ou déverrouille, et Flatpare te demande s'il faut l'ajouter.

### Coller un lien (iPhone et partout ailleurs)

Un iPhone ne peut rien partager vers Flatpare. Copie plutôt le lien de l'annonce, ouvre Flatpare et touche **Coller un lien** sur la page Appartements. Flatpare ajoute un appartement pour le lien et l'ouvre.

### Des appartements à partir d'un lien

Un appartement ajouté à partir d'un lien garde le lien et est marqué **Non traité** dans la liste. L'ajouter est gratuit, et tout le foyer peut tout de suite l'évaluer et le décrire. Sur sa page, **Joindre un PDF** ajoute le PDF de l'annonce et le lit ; avec une adresse, il est placé sur la carte. Sur la version hébergée, le premier des deux utilise un crédit d’appartement, et l'autre est ensuite gratuit. **Remplacer le PDF** change le PDF pour un plus récent sans le lire, donc les informations restent telles quelles ; touche **Retraiter** si tu veux qu'il soit lu. Les liens enregistrés sous **À ajouter** avant ce changement sont devenus des appartements de ce type.

---

## Si tu utilises la version hébergée

**Pendant la bêta privée, c’est gratuit.** Ce qu’un compte bêta obtient t’appartient : ni tes données ni tes crédits ne te seront repris à la fin de la bêta.

Flatpare coûte **CHF 5, une seule fois** — pas d’abonnement. Cela couvre jusqu’à 10 personnes et 40 appartements dans un foyer.

Les 40 comptent les appartements **traités**, pas ceux que tu gardes : un crédit est utilisé la première fois que le PDF d’un appartement est lu ou que son adresse est placée sur la carte. Ajouter un appartement à la main, le décrire et le noter est gratuit. En supprimer un libère de la place dans ta comparaison mais ne rend pas le crédit. Quand tu as utilisé tes 40, CHF 5 de plus ajoutent 40 appartements de plus.

Épuiser tes crédits empêche seulement de traiter de nouveaux appartements : tu peux toujours les ajouter, les décrire et les noter, puis les traiter après en avoir acheté d’autres. Cela ne te bloque jamais l’accès à ceux que tu as déjà.

Faire tourner Flatpare toi-même est gratuit et sans aucune limite.

**Envoyer un avis**, dans le menu sous ton nom, envoie un message directement à la personne qui exploite Flatpare, avec ton nom et ton adresse e-mail pour qu'elle puisse répondre, ou anonymement. Le serveur ne conserve rien de ce que tu envoies. La page **Conditions et confidentialité**, dans le même menu, dit qui exploite flatpare.com, le remboursement sous 14 jours et ce que le serveur conserve.

---

## Astuces

- **Phrase secrète oubliée ?** L’écran de déverrouillage propose **« Utiliser mon kit de récupération »** — saisis le code de 25 caractères et choisis une nouvelle phrase secrète. Si tu n’as ni la phrase secrète ni le code, personne ne peut récupérer les données.
- **« Réinitialiser mes clés »** y est aussi proposé, et ce n’est *pas* une réinitialisation de mot de passe : cela abandonne l’ancienne clé et attend que quelqu’un d’autre du foyer te transmette une nouvelle copie. Utile seulement si quelqu’un d’autre a encore accès.
- **Compare les codes de clé.** La page Foyer affiche à côté de chaque membre un code de huit petites images. Compare-les en personne ou lors d’un appel : le code qu’une personne voit pour elle-même sur son propre appareil doit correspondre à celui que tu vois pour elle. Sinon, ne fais pas confiance à cette clé.
- **Plusieurs propriétaires.** Sur la page Foyer, un propriétaire peut **Rendre propriétaire** n’importe quel membre. Chaque propriétaire peut inviter et retirer des personnes et renouveler la clé du foyer : le foyer continue de fonctionner si l’un de vous n’est plus là. Un propriétaire peut choisir **Ne plus être propriétaire** ou quitter le foyer tant qu’un autre propriétaire reste.
- **Nouvel appareil :** connecte-toi simplement et saisis ta phrase secrète ; rien n’est à transférer à la main.
- **Ajout groupé :** tu peux sélectionner plusieurs PDF à la fois sur la page Ajouter.
- **Réévalue quand tu veux :** les évaluations sont propres à chaque personne et modifiables à tout moment.
- **Adapté au mobile :** utilise la barre de navigation en bas de l’écran sur ton téléphone.
