# Solution for Issue #29

## 🛠️ Proposed Solution (by Aditya Waghamare)

### Analysis
To make `vazr` accessible to French-speaking developers, we need to provide a complete French translation of the README (`README.fr.md`) and update the language selection bar at the top of the English `README.md`.

### Fix
Created `README.fr.md` with fully translated documentation and updated `README.md` language switcher bar.

### Implementation
```markdown
# vazr

[![Licence : MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![GitHub des problèmes](https://img.shields.io/github/issues/lechakrawarthy/vazr)](https://github.com/lechakrawarthy/vazr/issues)
[![GitHub des demandes de tirage](https://img.shields.io/github/issues-pr/lechakrawarthy/vazr)](https://github.com/lechakrawarthy/vazr/pulls)

🌍 **Langues :** [English](README.md) (par défaut) · [Français](README.fr.md)

`vazr` est un outil de ligne de commande (CLI) moderne et ultra-rapide conçu pour simplifier la validation, le formatage et le lissage de la configuration des projets à travers de multiples environnements de développement. Que vous travailliez sur un petit script ou sur une architecture de microservices à grande échelle, `vazr` garantit que vos fichiers de configuration restent propres, conformes et sans erreurs.

---

## 🚀 Fonctionnalités

- **Validation instantanée :** Détecte les erreurs de syntaxe, les champs manquants et les incohérences de types dans vos fichiers JSON, YAML et TOML avant le déploiement.
- **Formatage cohérent :** Applique des règles de style unifiées à l'échelle de l'équipe pour tous les fichiers de configuration.
- **Extensible :** Écrivez des règles de validation personnalisées en JavaScript ou TypeScript.
- **Léger et rapide :** Compilé en un seul binaire natif sans dépendances lourdes à l'exécution.

---

## 📦 Installation

### Via Cargo (Rust)

```bash
cargo install vazr
```

### Via npm (Node.js)

```bash
npm install -g vazr
```

### Précompilé (Binaires)

Téléchargez le binaire correspondant à votre système d'exploitation depuis la [page des versions](https://github.com/lechakrawarthy/vazr/releases).

---

## ⚙️ Démarrage rapide

1. Initialisez `vazr` dans votre projet :

   ```bash
   vazr init
   ```

2. Validez les fichiers de configuration de votre projet :

   ```bash
   vazr validate
   ```

3. Exécutez une vérification à blanc sans modifier les fichiers :

   ```bash
   vazr --dry-run
   ```

---

## 🛠️ Utilisation avancée

Consultez le [Guide d'utilisation complet](docs/USER_GUIDE.md) pour plus d'options de configuration, les variables d'environnement prises en charge et la création de règles personnalisées.

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir un problème ou à soumettre une demande de tirage (PR). Lisez notre [Guide de contribution](CONTRIBUTING.md) pour commencer.

---

## 📄 Licence

Ce projet est sous licence MIT — consultez le fichier [LICENSE](LICENSE) pour plus de détails.

Signed-off-by: Aditya Waghamare <adityawaghamare7620@gmail.com>
```

### Testing
Verified Markdown structure, front-matter links, and non-translation of code blocks, flags, and URLs.


---
*Submitted by Aditya Waghamare*
💰 **Payout Address (Base L2 / EVM):** `0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C`