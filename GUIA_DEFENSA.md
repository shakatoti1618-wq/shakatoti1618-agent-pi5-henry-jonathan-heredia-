# GUÍA DE DEFENSA — GitHub AI Agent (MCP Server)

Guion de estudio para la **entrevista de entrega / defensa en vivo** del Proyecto Integrador 5.
Esto te permite explicar **todo el código** y **toda la aplicación** con criterio propio. Léelo 2–3 veces y ensaya la demo antes del día.

---

## 1. Resumen del proyecto (para los primeros 60 segundos)

> "Construí un **MCP Server** en Node.js + TypeScript que permite a un agente de IA (Gemini o Claude) ejecutar operaciones reales en GitHub usando lenguaje natural. El usuario le escribe a Antigravity 'crea un issue en mi repo', el LLM decide qué tool usar, el server valida los datos con Zod, ejecuta la llamada a la GitHub API con Octokit y devuelve un resultado en lenguaje natural. Tiene 8 tools, manejo de errores por categorías, retry con exponential backoff, 40 tests unitarios con mocks y documentación completa."

**Números para mencionar:** 8 tools (5 mínimos + 3 extra), 40 tests (mínimo pedido: 8), 5 categorías de error, retry 3 intentos con backoff.

---

## 2. La arquitectura (explícala SIN leer el código)

Hay **4 actores**. Confundir sus roles es el error más común:

```
Antigravity (Host)   → gestiona la sesión y conecta los componentes
      ↓
LLM (Client)         → recibe el prompt, lee los tools y decide cuál usar
      ↓  JSON-RPC por stdio
MCP Server (mi código) → expone tools, valida con Zod, ejecuta operaciones
      ↓  HTTPS con token
GitHub API (Octokit) → repos, issues, commits, PRs
```

**La pregunta clave:** ¿quién decide qué tool usar? **El LLM, no el usuario.** El LLM lee las descripciones que el server expone en `tools/list` y elige el tool + parámetros. Por eso escribí descripciones detalladas en `src/tools/definitions.ts`.

**El viaje de una request:**
1. El usuario escribe en Antigravity: *"abre un issue 'Fix login' en mi-proyecto"*.
2. El LLM lee las 8 descripciones de tools y decide: `create_issue` con `{owner, repo, title}`.
3. Antigravity envía `tools/call` por stdio → el server recibe en `tools/call` (handlers).
4. Zod valida el input (¿están todos los requeridos? ¿el repo tiene 3–100 chars?).
5. `GitHubOperations.createIssue` llama a `octokit.issues.create` (HTTPS autenticado).
6. El resultado se formatea como texto y vuelve al LLM, que se lo cuenta al usuario.

---

## 3. Explicación archivo por archivo (con decisiones)

### `src/index.ts` — Entry point
- Carga `dotenv`, lee `GITHUB_TOKEN`. Si no existe → `logger.error` y `process.exit(1)` (**fail fast**, no arranca un server que va a fallar).
- Crea: cliente Octokit → operaciones → server MCP → `StdioServerTransport`.
- **Nunca usa `console.log`**: todo el logging va por `console.error` (stderr) porque stdout está reservado para JSON-RPC. Un `console.log` ahí corrompe el protocolo.
- Maneja SIGINT/SIGTERM para un cierre limpio.

### `src/server.ts` — Instancia MCP
- Crea `new Server({name: "shakatoti1618-agent", version}, {capabilities: {tools: {}}})`.
- Registra `ListToolsRequestSchema` (devuelve `TOOL_DEFINITIONS`) y `CallToolRequestSchema` (delega en `callTool`).
- **Decisión:** usar los *RequestSchema* del SDK (no strings) porque el SDK así valida el protocolo y los tipos son correctos.

### `src/schemas/schemas.ts` — Zod (doble función)
- **Validar** inputs antes de tocar la API, **y comunicarle al LLM** qué parámetros espera (vía descripciones).
- Reflejan **reglas reales de GitHub**: repo 3–100 chars, `[a-zA-Z0-9._-]`, no empezar/terminar en punto, sin `..`; owner 1–39 chars; issueNumber entero positivo; state `open|closed|all`.
- Mensajes de error claros: *"El nombre del repositorio debe tener al menos 3 caracteres"* (no "invalid input").
- `z.infer` genera los tipos TS desde los schemas → **una sola fuente de verdad**.

### `src/github/client.ts` — Configuración del cliente
- `createGitHubClient(token)` → `new Octokit({auth, timeout})`.
- Separado de las operaciones para poder **mockearlo** en los tests.

### `src/github/operations.ts` — Lógica de negocio
- Cada método: llama a Octokit → mapea la respuesta cruda a **tipos de dominio** (RepositoryInfo, IssueInfo…) → los errores pasan por `fromOctokitError`.
- `createCommit`: para "agregar o modificar un archivo" usa `repos.createOrUpdateFileContents`. Si el archivo ya existe busca su `sha` (si no, GitHub devuelve 422); un 404 significa "archivo nuevo".
- Todo envuelto en `withRetry`.

### `src/tools/definitions.ts` — Lo que ve el LLM
- Cada tool: `name`, `description` (escrita para que el LLM sepa CUÁNDO usarla) e `inputSchema`.
- **Decisión:** el JSON Schema se deriva de los schemas de Zod con `zod-to-json-schema`. Así la validación y lo que ve el LLM nunca se desincronizan.

### `src/tools/handlers.ts` — Dispatcher
- Recibe `{name, arguments}` → busca el schema → `safeParse`.
- Si Zod falla: `isError: true` + mensajes de validación formateados.
- Si pasa: ejecuta la operación; si hay error, `classifyError` y devuelve el `userMessage`.
- **Nunca** devuelve un stack trace al LLM.

### `src/errors/errors.ts` — El corazón del manejo de errores
- `AppError` base (categoría + `userMessage` + `retryable`).
- Subclases: `ValidationError`, `AuthenticationError`, `GitHubAPIError`, `RateLimitError`, `NetworkError`.
- `fromOctokitError`: detecta 401 → auth; 403 sin rate limit → auth/permisos; 429 o 403 con `X-RateLimit-Remaining: 0` → rate limit; sin status → red; resto → API.
- `withRetry`: **exponential backoff** (1s → 2s → 4s con jitter, máx 3 intentos). Solo reintenta RATE_LIMIT/NETWORK. **Nunca** reintenta en loop inmediato (empeora el rate limit).

### `src/utils/logger.ts` y `src/utils/validators.ts`
- Logger estructurado por niveles (`LOG_LEVEL`), todo a stderr, **nunca loguea el token**.
- Validators: reglas de GitHub compartidas entre schemas y tests.

---

## 4. Conceptos que preguntan sí o sí

**¿Diferencia entre chatbot, asistente AI y AI agent?**
- **Chatbot:** responde preguntas conversacionales, no ejecuta acciones (no tiene tools ni contexto de ejecución).
- **Asistente AI:** usa herramientas o integraciones, pero el flujo suele ser reactivo y más acotado.
- **AI agent:** es **autónomo**: recibe un objetivo, decide qué tools usar, con qué parámetros, en qué orden, ejecuta y observa resultados para decidir el siguiente paso. Este proyecto es un agent: el LLM planifica usando los tools del server.

**¿Por qué el LLM necesita leer las descripciones de los tools?**
- El LLM no "conoce" mi código: conoce lo que le expongo en `tools/list`. La descripción es su mapa. Si digo "Crea un issue en un repo", sabe cuándo usar `create_issue`; si la descripción fuera vaga ("hace cosas"), inventaría el tool o usaría el equivocado. Por eso las descripciones son tan importantes como el código.

**¿Por qué stdio y no HTTP?**
- MCP es un protocolo de **procesos locales**: el server es un proceso hijo del host. stdio es más simple, seguro (no expones un puerto de red) y no requiere configurar puertos/CORS/credenciales de red. La comunicación es JSON-RPC línea por línea por stdin/stdout. (Extra: HTTP/SSE existe para servidores remotos, pero para un server local stdio es lo adecuado.)

**¿Qué ventaja tiene usar mocks en vez de la API real?**
- Los tests son **rápidos y deterministas**: no dependen de red, tokens, rate limits ni del estado real de GitHub. Puedo simular tanto el éxito como el error (404, 401, 429) que es casi imposible de reproducir contra la API real. Es la práctica estándar para testear integraciones externas.

---

## 5. Estrategia de testing (40 tests, 4 archivos)

| Archivo | Qué verifica y por qué importa |
|---|---|
| `tests/schemas.test.ts` | Inputs válidos pasan; inválidos (repo corto, chars malos, sin título, state malo, issueNumber negativo) fallan **con mensajes claros**. Esto demuestra que los schemas previenen errores de la API. |
| `tests/operations.test.ts` | Con un **fake de Octokit** (objetos `vi.fn()`), verifica que se llama al método correcto con los argumentos correctos y que el resultado se mapea. También verifica transformación de 404/401/429/500. |
| `tests/errors.test.ts` | `fromOctokitError`: 401→Auth, 403→permisos, 429/header→RateLimit, sin status→Network, 404→API. Y el retry: reintenta errores transitorios con backoff, no reintenta auth. |
| `tests/handlers.test.ts` | El dispatcher: tool desconocido → error útil; input inválido → NO llama a la API; error de operación → mensaje en lenguaje natural con `isError: true`. |

**Cómo lo contaría en la defensa:** "Mockeo el cliente de GitHub inyectando un objeto fake. Así el test verifica el *contrato*: mi código llama a `issues.create` con owner, repo y title, y devuelve el issue mapeado. Y puedo simular un 404 para probar la transformación de errores, algo que contra la API real es impredecible."

---

## 6. Decisiones de diseño (ten 3+ justificadas a mano)

1. **Separación por capas** (`client.ts` / `operations.ts` / `schemas` / `errors` / `utils`): cada archivo tiene UNA responsabilidad. `client.ts` solo configura Octokit; `operations.ts` solo negocio; `errors.ts` solo errores. Esto es lo que hace el testing posible.
2. **Una sola fuente de verdad para los schemas**: los schemas de Zod definen validación Y tipos TS (`z.infer`) Y el JSON Schema que ve el LLM (`zod-to-json-schema`). Si cambia un nombre de campo, cambia en las tres partes.
3. **Errores como ciudadanos de primera clase**: cada error tiene categoría y `userMessage`. El LLM no necesita entender stack traces; solo lee el mensaje y se lo transmite al usuario. `fromOctokitError` es el único punto donde lo técnico se traduce a lenguaje natural.
4. **Retry solo para errores transitorios + backoff con jitter**: reintentar al instante un 429 es contraproducente. La espera crece exponencialmente y el jitter evita que todos los reintentos peguen en ráfaga.
5. **Fail-fast sin token**: si no hay `GITHUB_TOKEN`, el server ni arranca, con un mensaje que explica qué hacer (copiar `.env.example`, scopes).
6. **Logging a stderr con niveles**: nunca contaminar stdout; poder depurar con `LOG_LEVEL=debug`.

---

## 7. Qué haría diferente si lo volviera a hacer

- **Caché en memoria** de `list_repositories`/`list_commits` (TTL ~5 min) para gastar menos rate limit.
- **Métricas de uso** de cada tool (contador) para saber cuáles usan más los usuarios.
- **Soporte multi-usuario / organizaciones** (`admin:org`) y validaciones pre-flight de permisos.
- Tests de **integración** con la API real (una vez, con un repo de prueba) para complementar los unit.
- Un **health-check endpoint** (tool `health_check`) que verifique conectividad con GitHub.

---

## 8. Guion de demo (ensaya esto al menos 1 vez)

**Pre-requisitos el día de la demo:** `npm run build` ya ejecutado, `.env` con token válido, Antigravity con el server cargado. Plan B: capturas de pantalla de la pantalla de tools y de una sesión pasada.

1. **Abrir Antigravity** con el MCP configurado → mostrar que el agente "ve" los 8 tools.
2. **Tool 1 (list_repositories):** `"¿Qué repositorios tengo?"` → mostrar la respuesta JSON.
3. **Tool 2 (create_issue):** `"Abre un issue en <tu-repo> titulado 'Test demo defensa'"` → mostrar el issue creado (puedes verlo en GitHub).
4. **Tool 3 (close_issue):** `"Cierra el issue número <n> de <tu-repo>"` → mostrar que cambia a cerrado.
5. **Mostrar un error controlado:** `"crea un repo llamado 'ab'"` → el agente responde con el error de validación claro ("al menos 3 caracteres") en vez de un stack trace.
6. **Mostrar los tests:** `npm test` → 40 passing.
7. **Cerrar con la arquitectura** (diagrama) y 2 decisiones de diseño.

---

## 9. Preguntas rápidas de repaso

| Pregunta | Respuesta corta |
|---|---|
| ¿Qué es MCP? | Protocolo que conecta hosts (Antigravity), clientes (LLM) y servers (mi código) para exponer tools a los agentes. |
| ¿Qué hace el `tools/call`? | Recibe el nombre del tool y sus argumentos, valida con Zod y ejecuta. |
| ¿Por qué Zod y no validar a mano? | Tipos inferidos, mensajes claros, validación declarativa y el JSON Schema para el LLM sale del mismo schema. |
| ¿Qué es un 403 sin rate limit? | Casi siempre falta de scope: regenerar token con `repo`, `user`, `admin:org`. |
| ¿Cuándo NO reintentás? | Nunca en validación ni autenticación; solo rate limit y red, con backoff. |
| ¿Por qué el server no usa `console.log`? | stdout transporta JSON-RPC; el logging va a stderr. |
| ¿Cuántos tests y qué cubren? | 40: schemas, operaciones (con mocks), errores y dispatcher de tools. |
| ¿Qué extra hiciste? | 3 tools avanzados, logging por niveles, schemas derivados, retry con jitter, cierre limpio. |

---

## 10. Comandos de referencia

```bash
npm run typecheck   # chequeo de tipos (sin emitir)
npm test            # 40 tests
npm run build       # genera dist/
npm run dev         # corre el server en modo desarrollo (tsx watch)
npm start           # corre dist/index.js
npx @modelcontextprotocol/inspector node dist/index.js   # debug de tools
```
