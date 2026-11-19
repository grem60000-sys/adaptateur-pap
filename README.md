# Adaptateur PAP

Outil web pour adapter les évaluations et les cours aux plans d'accompagnement personnalisés (PAP).
Conçu par JR Enseignement.

- Aucun nom d'élève : chaque élève est enregistré sous un identifiant.
- Aucun diagnostic : un profil est une liste d'adaptations cochées.
- Chaque établissement enregistre sa propre clé API, chiffrée côté serveur.
- Exports Word, PDF et HTML interactif.

Fichiers : `index.html` (interface), `app.js` (application), `rendu.js` (mise en forme et export Word).
La base de données et le moteur d'adaptation sont hébergés sur Supabase.
