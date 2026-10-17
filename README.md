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
- **Livraison** : le client touche « Partager ma position » (GPS du téléphone). Les frais sont calculés à
  **500 F par km commencé** (au moins 1 km), à vol d'oiseau depuis le restaurant, et ajoutés au total « À payer ».
  Le gestionnaire règle le prix par km et la position du restaurant (onglet Commandes → Livraison), voit la distance,
  ouvre l'itinéraire Google Maps vers le client, et l'app l'avertit si les frais ne correspondent pas à la position.
  À la livraison, une vente « Livraison » est ajoutée dans la caisse.
- **Paiement Mobile Money** (Orange Money *144#, Moov Money *555#) : après la commande, le client touche
  « Ouvrir Orange Money » (le code s'affiche dans son téléphone), envoie le montant au numéro du restaurant,
  puis recopie la référence du SMS. Le gestionnaire vérifie le SMS reçu et touche « Paiement reçu » ou « Pas reçu ».
  Le client ne peut jamais marquer lui-même un paiement comme reçu. Numéros, nom et codes : onglet Commandes → Paiement Mobile Money.
- **Sécurité des commandes** (`firestore.rules`) : un client peut seulement lire le menu, envoyer une commande valide quand les commandes
  sont ouvertes (le serveur recalcule le total : impossible de payer moins que ses plats), et lire SA commande grâce à son numéro secret.
  Il ne voit jamais les ventes, achats, caisse ni les autres commandes. Pas plus d'une commande par minute depuis le même téléphone.

## Sécurité de la caisse
- **Équipe autorisée** : seuls les e-mails inscrits dans *Carte → Équipe et accès* peuvent ouvrir la caisse
  (rôles **propriétaire** et **gestionnaire**). Un compte retiré perd l'accès tout de suite et la caisse est effacée de son téléphone.
- **Code secret à 4 chiffres** sur chaque téléphone : demandé à l'ouverture et après 2 minutes hors de l'application.
  5 codes faux → attente ; 10 codes faux → le téléphone est déconnecté et vidé. « Code oublié » → reconnexion par e-mail.
- **Déconnexion** = effacement de la copie des données gardée sur le téléphone.
- **APK version finale** : non débogable, pas de sauvegarde Google / transfert des données, pas de journal, connexions chiffrées seulement.

**À faire une seule fois (dans cet ordre) :**
1. Console Firebase → Firestore Database → **Règles** : coller le contenu de `firestore.rules` → **Publier**.
2. Console Firebase → Authentication → **Settings → User actions** : décocher **Enable create (sign-up)**
   (personne ne peut se créer un compte tout seul ; le propriétaire crée les comptes dans Users).
3. Dans l'application, le propriétaire : *Carte → Équipe et accès → 🔒 Protéger la caisse*, puis ajoute les e-mails de l'équipe.
4. (Facultatif) GitHub → dépôt → **Settings → Pages** → Source : **GitHub Actions**. Sans ce réglage, le menu marche aussi : le lien ouvre `index.html` à la racine, qui mène au dossier `client/` (déjà construit et enregistré dans le dépôt). Après une modification de `src/client.js`, lancer `npm run build` et enregistrer aussi `client/client.js`.

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
