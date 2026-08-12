# shakatoti1618-agent — GitHub AI Agent (MCP Server)

Servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io) que permite a un agente de IA (LLM: Gemini, Claude, etc.) ejecutar operaciones reales en **GitHub** usando **lenguaje natural**, integrado con **Antigravity** como host.

- **Proyecto Integrador 5** — Especialización Backend · Henry
- **Stack:** Node.js 18+ · TypeScript · MCP SDK · Octokit · Zod · Vitest
- **Comunicación:** stdio (JSON-RPC)

---

## Tabla de contenidos

1. [Arquitectura](#arquitectura)
2. [Tools disponibles](#tools-disponibles)
3. [Requisitos](#requisitos)
4. [Obtener el GitHub Token](#obtener-el-github-token)
5. [Instalación](#instalación)
6. [Configuración en Antigravity](#configuración-en-antigravity)
7. [Verificar que funciona (MCP Inspector)](#verificar-que-funciona-mcp-inspector)
8. [Ejemplos de prompts](#ejemplos-de-prompts)
9. [Estructura del proyecto](#estructura-del-proyecto)
10. [Errores y troubleshooting](#errores-y-troubleshooting)
11. [Testing](#testing)
12. [Extras implementados](#extras-implementados)

---

## Arquitectura

```
┌────────────────────────────────────────────────────────────────┐
│  ANTIGRAVITY (Host)                                            │
│  Gestiona la sesión y conecta los componentes                  │
└──────────────────────────────┬─────────────────────────────────┘
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  LLM — Gemini / Claude (Client)                                │
│  Lee la descripción de los tools y decide cuál usar            │
└──────────────────────────────┬─────────────────────────────────┘
                               ▼   JSON-RPC sobre stdio
┌────────────────────────────────────────────────────────────────┐
│  MCP SERVER — shakatoti1618-agent (tu código)                  │
│  tools/list · tools/call · validación Zod · errores            │
└──────────────────────────────┬─────────────────────────────────┘
                               ▼   HTTPS (autenticado)
┌────────────────────────────────────────────────────────────────┐
│  GITHUB API (vía Octokit)                                      │
│  repos · issues · commits · pull requests                      │
└────────────────────────────────────────────────────────────────┘
```

**¿Quién decide qué tool usar?** No el usuario directamente: el **LLM** lee las descripciones de los tools (que expone `tools/list`) y elige cuál invocar y con qué parámetros. Por eso cada descripción está escrita para que el agente distinga cuándo usarla.

---

## Tools disponibles

| Tool | Descripción | Parámetros |
|------|-------------|------------|
| `create_repository` | Crea un repositorio | `name`*, `description`, `isPrivate`, `autoInit` |
| `create_issue` | Abre un issue | `owner`*, `repo`*, `title`*, `body` |
| `list_repositories` | Lista repos del usuario | `perPage`, `page` |
| `create_commit` | Crea/actualiza un archivo (commit) | `owner`*, `repo`*, `path`*, `message`*, `content`*, `branch` |
| `list_issues` | Lista issues de un repo | `owner`*, `repo`*, `state`, `perPage` |
| `close_issue` | Cierra un issue | `owner`*, `repo`*, `issueNumber`* |
| `create_pull_request` | Crea un PR entre ramas | `owner`*, `repo`*, `title`*, `head`*, `base`*, `body` |
| `list_commits` | Lista commits recientes | `owner`*, `repo`*, `perPage` |

`*` = requerido. Los schemas de Zod validan cada parámetro **antes** de llamar a la API (nombres de repos 3–100 chars alfanuméricos con guiones, issueNumber entero positivo, estado `open|closed|all`, etc.) y sus mensajes de error son comprensibles para el usuario final.

---

## Requisitos

- Node.js **18+**
- npm
- Una cuenta de GitHub
- Antigravity (para usarlo con el agente) o MCP Inspector (para debug)

## Obtener el GitHub Token

1. Ve a GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. **Generate new token (classic)**.
3. Da un nombre (ej. `mcp-agent`), expiración, y marca los scopes:

   | Scope | Para qué sirve |
   |-------|----------------|
   | `repo` | Repositorios, issues, commits, PRs |
   | `user` | Información del usuario autenticado |
   | `admin:org` | Operaciones sobre organizaciones |

4. **Copia el token** (empieza con `ghp_…`). Solo se muestra una vez.

> ⚠️ **Seguridad:** el token NUNCA se sube al repositorio. Está en `.env` (ignorado por `.gitignore`). Si se expone por error, revócalo de inmediato en GitHub.

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo .env a partir del ejemplo
cp .env.example .env   # (en Windows: copy .env.example .env)

# 3. Editar .env y pegar tu token
#    GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx

# 4. Compilar y verificar
npm run typecheck
npm test
npm run build
```

## Configuración en Antigravity

Crea el archivo `.mcp.json` en la raíz del proyecto (este archivo está en `.gitignore` porque contiene credenciales):

```json
{
  "mcpServers": {
    "shakatoti1618-agent": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

> Requiere `npm run build` antes, o usa `"command": "npx", "args": ["tsx", "src/index.ts"]` para desarrollo. El `dist/` se genera con `npm run build`.

## Verificar que funciona (MCP Inspector)

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Con el inspector puedes listar los tools (`tools/list`) y probar cada uno (`tools/call`) sin tocar el agente.

## Ejemplos de prompts

| Objetivo | Prompt que funciona |
|----------|--------------------|
| Crear repo | "Crea un repositorio llamado `mi-proyecto` con una descripción breve y que sea privado." |
| Crear issue | "Abre un issue en `shakatoti1618/mi-proyecto` con el título `Fix: no carga la página` y una descripción." |
| Listar repos | "¿Qué repositorios tengo?" |
| Commit | "Agrega el archivo `docs/README.md` con el contenido `# Documentación` al repo `shakatoti1618/mi-proyecto`, con mensaje `Agrega documentación`." |
| Listar issues | "Muéstrame los issues abiertos de `shakatoti1618/mi-proyecto`." |
| Cerrar issue | "Cierra el issue número 3 de `shakatoti1618/mi-proyecto`." |
| Crear PR | "Crea un pull request de `feature/login` hacia `main` en `shakatoti1618/mi-proyecto` con título `Implementa login`." |
| Ver commits | "¿Cuáles son los últimos commits de `shakatoti1618/mi-proyecto`?" |

**Nota:** un prompt vago ("haz cosas con mi repo") confunde al LLM. Cuanto más específico sea (nombre exacto del repo, rama, mensaje), mejor resultado.

## Estructura del proyecto

```
shakatoti1618-agent/
├── src/
│   ├── index.ts               # Entry point: env, cliente, server, stdio
│   ├── server.ts              # Instancia MCP + registro de handlers
│   ├── types.ts               # Tipos de dominio compartidos
│   ├── schemas/schemas.ts     # Schemas Zod (validación + descripciones)
│   ├── github/
│   │   ├── client.ts          # Configuración del cliente Octokit
│   │   └── operations.ts      # Operaciones de negocio sobre GitHub
│   ├── tools/
│   │   ├── definitions.ts     # Tools que ve el LLM (name/description/schema)
│   │   └── handlers.ts        # Dispatcher: valida, ejecuta, formatea
│   ├── errors/errors.ts       # Custom errors + transformación + retry/backoff
│   └── utils/
│       ├── logger.ts          # Logging estructurado (stderr, nunca stdout)
│       └── validators.ts      # Reglas de GitHub compartidas
├── tests/                     # Unit tests (Vitest + mocks)
├── .env.example               # Plantilla sin valores reales
├── .gitignore
├── tsconfig.json
└── package.json
```

**¿Por qué separar `client.ts` de `operations.ts`?** No es solo organización: permite **mockear** el cliente de Octokit en los tests sin tocar la lógica de negocio. `operations.ts` recibe el cliente por constructor, así que en los tests se inyecta un objeto fake con `vi.fn()`.

**¿Por qué el logging usa `console.error` y nunca `console.log`?** El server MCP se comunica por **stdio**: el host lee JSON-RPC de `stdout`. Cualquier `console.log` rompe el protocolo. Por eso todos los logs van a `stderr`.

## Errores y troubleshooting

El server distingue 5 categorías de error y devuelve **mensajes en lenguaje natural**, nunca stack traces:

| Categoría | Origen | Ejemplo de mensaje al usuario |
|-----------|--------|-------------------------------|
| `VALIDATION` | Input inválido (Zod) | "El nombre del repositorio debe tener al menos 3 caracteres." |
| `AUTHENTICATION` | Token inválido / sin scope (401/403) | "Tu token no tiene permisos para esta operación." |
| `API` | GitHub respondió mal (404, 422, 500) | "El repositorio [x] no fue encontrado. Verifica el nombre e intenta de nuevo." |
| `RATE_LIMIT` | Límite de requests (429/403) | "Se alcanzó el límite de solicitudes a la API de GitHub. Espera e intenta de nuevo." |
| `NETWORK` | Sin conexión / timeout | "No se pudo conectar con GitHub. Verifica tu conexión." |

**Rate limiting:** los errores transitorios se reintentan con **exponential backoff** (3 intentos, espera creciente con jitter). No se reintenta nunca de forma inmediata, para no empeorar el problema, ni se reintentan errores definitivos (validación/autenticación).

### Problemas frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| El server no arranca: "No se encontró GITHUB_TOKEN" | `.env` no existe o vacío | Copiar `.env.example` → `.env` y pegar el token |
| `403` en todas las operaciones | Token sin el scope `repo` | Regenerar el token marcando `repo`, `user`, `admin:org` |
| `401 Bad credentials` | Token inválido/revocado | Generar un token nuevo |
| El agente no responde o responde mal | El server quedó colgado o `dist/` desactualizado | `npm run build` y reiniciar el server en Antigravity |
| No se ve ningún tool | `dist/index.js` no existe | `npm run build` |
| El protocolo se rompe (errores raros de parsing) | Algo escribió en stdout (un `console.log` accidental) | Buscar y reemplazar por el `logger` |
| `429` repetidos | Demasiadas llamadas en poco tiempo | Esperar o bajar la frecuencia; el server reintenta solo con backoff |

## Testing

```bash
npm run test        # corre todos los tests (Vitest)
npm run test:watch  # modo watch
```

- **40 tests** distribuidos en 4 archivos:
  - `tests/schemas.test.ts` — validación de inputs (válidos pasan, inválidos fallan con mensajes claros).
  - `tests/operations.test.ts` — lógica de GitHub con **Octokit mockeado** (sin llamadas reales).
  - `tests/errors.test.ts` — transformación 401/403/404/429 → mensajes y retry con backoff.
  - `tests/handlers.test.ts` — dispatcher de tools (tool desconocido, inputs inválidos, errores).
- Los tests son **deterministas**: no dependen de la API real ni del estado externo.

## Extras implementados

- **+3 tools avanzados** (extra credit): `close_issue`, `create_pull_request`, `list_commits`.
- **Logging estructurado** con niveles (`LOG_LEVEL=debug|info|warn|error`) vía stderr.
- **Schemas derivados**: el JSON Schema que ve el LLM se genera desde los schemas de Zod (`zod-to-json-schema`), una sola fuente de verdad.
- **Retry con exponential backoff** y jitter para rate limit/errores de red.
- **Cierre limpio** del server ante SIGINT/SIGTERM.

---

Desarrollado como Proyecto Integrador 5 · Henry · Especialización Backend.
