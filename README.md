# WON HOUSE — caisse du restaurant (Android)

Application Android pour le gestionnaire et le propriétaire du restaurant WON HOUSE :
ventes, achats (dont courant et loyer), caisse du soir, journal, bilan du mois (du 26 au 25),
photos datées prises avec la caméra, et synchronisation entre tous les téléphones.

## Télécharger l'application
Onglet **Releases** du dépôt → dernière version → **WON-HOUSE-caisse.apk**.
Sur le téléphone : ouvrir le fichier, autoriser « installer des applications inconnues », puis Installer.

## Menu en ligne et commandes des clients
Les clients voient **uniquement le menu** et **commandent**, sans installer d'application ni créer de compte :
- **Page client** : https://deograciasclinique-sketch.github.io/won-house-caisse/ (dossier `client/`, code dans `src/client.js`).
  Le client choisit ses plats, puis « sur place » (n° de table), « à emporter » ou « livraison » (adresse + téléphone),
  envoie la commande et suit son état en direct : Envoyée → Acceptée → Prête → Servie. Il paie au restaurant.
  Avec `?table=5` à la fin du lien, la table est déjà remplie (QR code à poser sur la table).
- **Onglet « Commandes »** dans l'application du gestionnaire : sonnerie et badge à chaque nouvelle commande (application ouverte),
  boutons Accepter / Refuser (avec motif) / Prête / **Servie et payée** — ce dernier enregistre tout seul les ventes dans « Aujourd'hui ».
  On y ouvre ou ferme les commandes, on marque un plat « épuisé », on règle le téléphone affiché aux clients,
  et on obtient le lien et le QR code du menu (général ou par table).
- Le menu public (`public/menu`) est copié automatiquement depuis la Carte (plats et prix).
- **Sécurité** (`firestore.rules`) : un client peut seulement lire le menu, créer une commande valide quand les commandes
  sont ouvertes, et lire SA commande grâce à son numéro secret. Il ne voit jamais les ventes, achats, caisse ni les autres commandes.

**À faire une seule fois :**
1. Console Firebase → Firestore Database → **Règles** : coller le contenu de `firestore.rules` → **Publier**.
2. GitHub → dépôt → **Settings → Pages** → Source : **GitHub Actions** (le workflow « Publier le menu client » met la page en ligne).

## Menu et partage
Le bouton ☰ en haut à droite ouvre le menu : sections, synchronisation, et
« Envoyer l'application par WhatsApp » (envoie le fichier d'installation, même sans internet)
ou « Envoyer le lien de téléchargement ».
Toutes les versions sont signées avec la même clé (`android/app/wonhouse.keystore`) :
une nouvelle version s'installe par-dessus l'ancienne sans perdre les données.

## Actualiser (tirer vers le bas)
En haut de l'écran, tirer vers le bas puis relâcher : l'application relance la connexion,
envoie les saisies en attente, reçoit les dernières données des autres téléphones, et vérifie
s'il existe une nouvelle version (bandeau « Mettre à jour » → télécharge et installe l'APK par-dessus).

## Hors connexion
L'application fonctionne sans internet (après une première connexion au compte).
Chaque saisie (vente, achat, caisse, photo, carte) est enregistrée tout de suite sur le téléphone ;
le badge en haut affiche « Hors ligne · N en attente ». Les saisies restent gardées même si
l'application est fermée ou le téléphone éteint, et partent seules au serveur dès que internet
revient (message « ✓ Saisies hors ligne envoyées au serveur »).

## Comptes
Les comptes se créent dans la console Firebase → Authentication → Users → Ajouter un utilisateur.
Chaque personne se connecte une fois avec son e-mail et son mot de passe ; la connexion reste mémorisée.

## Technique
- `www/index.html` : l'application (interface, calculs).
- `src/shim.js` : connexion Firebase (Auth, Firestore avec cache hors ligne), photos stockées dans Firestore, caméra en direct.
- `www/config.js` : configuration Firebase du restaurant.
- `firestore.rules` : règles de sécurité à coller dans Firestore → Règles.
- `.github/workflows/android.yml` : construit l'APK à chaque envoi sur `main` et le publie dans Releases.
