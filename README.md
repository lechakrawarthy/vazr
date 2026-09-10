<div align="center">

# vazr

[![GitHub release](https://img.shields.io/github/v/release/lechakrawarthy/vazr?include_prereleases=&sort=semver&color=blue)](https://github.com/lechakrawarthy/vazr/releases/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/lechakrawarthy/vazr)](https://github.com/lechakrawarthy/vazr/issues)

🌍 **Idiomas:** [English](README.md) · **Español** (por defecto)

</div>

---

**vazr** es una herramienta de línea de comandos (CLI) rápida y ligera diseñada para gestionar, validar y auditar configuraciones de proyectos de manera eficiente.

---

## 🚀 Características

- **Validación instantánea**: Comprueba archivos de configuración contra esquemas estrictos antes de que lleguen a producción.
- **Ligero y sin dependencias**: Compilado en un único binario portátil y rápido.
- **Extensible**: Escribe comprobaciones personalizadas utilizando sencillos scripts o complementos de JSON/YAML.
- **Compatible con CI/CD**: Se integra perfectamente en GitHub Actions, GitLab CI y cualquier pipeline de integración continua.

---

## 📦 Instalación

### Con Go

Si tienes Go instalado en tu sistema, puedes instalar `vazr` directamente:

\`\`\`bash
go install github.com/lechakrawarthy/vazr@latest
\`\`\`

### Binarios Precompilados

Descarga el binario correspondiente a tu sistema operativo desde la [sección de releases](https://github.com/lechakrawarthy/vazr/releases).

---

## 🏁 Uso Rápido

Ejecuta `vazr` en el directorio raíz de tu proyecto para validar los archivos de configuración predeterminados:

\`\`\`bash
vazr run
\`\`\`

Para comprobar un archivo de configuración específico:

\`\`\`bash
vazr --config ./config/production.json
\`\`\`

Muestra ayuda y opciones disponibles:

\`\`\`bash
vazr --help
\`\`\`

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor, lee [CONTRIBUTING.md](CONTRIBUTING.md) antes de enviar un pull request o reportar un issue.

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---
Signed-off-by: Aditya Waghamare <adityawaghamare7620@gmail.com>