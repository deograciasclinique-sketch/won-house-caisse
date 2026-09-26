# WON HOUSE — caisse du restaurant (Android)

Application Android pour le gestionnaire et le propriétaire du restaurant WON HOUSE :
ventes, achats (dont courant et loyer), caisse du soir, journal, bilan du mois (du 26 au 25),
photos datées prises avec la caméra, et synchronisation entre tous les téléphones.

## Télécharger l'application
Onglet **Releases** du dépôt → dernière version → **WON-HOUSE-caisse.apk**.
Sur le téléphone : ouvrir le fichier, autoriser « installer des applications inconnues », puis Installer.

## Comptes
Les comptes se créent dans la console Firebase → Authentication → Users → Ajouter un utilisateur.
Chaque personne se connecte une fois avec son e-mail et son mot de passe ; la connexion reste mémorisée.

## Technique
- `www/index.html` : l'application (interface, calculs).
- `src/shim.js` : connexion Firebase (Auth, Firestore avec cache hors ligne), photos stockées dans Firestore, caméra en direct.
- `www/config.js` : configuration Firebase du restaurant.
- `firestore.rules` : règles de sécurité à coller dans Firestore → Règles.
- `.github/workflows/android.yml` : construit l'APK à chaque envoi sur `main` et le publie dans Releases.
