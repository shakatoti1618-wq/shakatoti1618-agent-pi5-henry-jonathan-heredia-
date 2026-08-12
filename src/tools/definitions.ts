// src/tools/definitions.ts
// Definición de los tools que el LLM ve en "tools/list".
//
// La DESCRIPCIÓN de cada tool es tan importante como su código: es lo que el
// LLM lee para decidir cuándo invocarlo y con qué parámetros. Una descripción
// vaga hace que el agente tome decisiones equivocadas.
//
// El inputSchema se DERIVA de los schemas de Zod (zod-to-json-schema). Así la
// validación y lo que el LLM ve nunca se desincronizan.

import { zodToJsonSchema } from "zod-to-json-schema";
import { toolSchemas } from "../schemas/schemas.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const toJsonSchema = (name: keyof typeof toolSchemas) =>
  zodToJsonSchema(toolSchemas[name]) as Record<string, unknown>;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "create_repository",
    description:
      "Crea un nuevo repositorio en la cuenta autenticada de GitHub. Usa este tool cuando el usuario pida crear, inicializar o agregar un repositorio nuevo. Devuelve el nombre, la URL y si es privado. Si no se indica privacidad, se crea público.",
    inputSchema: toJsonSchema("create_repository"),
  },
  {
    name: "create_issue",
    description:
      "Abre un issue en un repositorio específico de GitHub. Usa este tool cuando el usuario quiera reportar un problema, sugerir una tarea o abrir un issue. Requiere el owner (usuario u organización), el nombre del repo y un título. Devuelve el número y la URL del issue creado.",
    inputSchema: toJsonSchema("create_issue"),
  },
  {
    name: "list_repositories",
    description:
      "Lista los repositorios del usuario autenticado en GitHub. Usa este tool cuando el usuario pregunte 'qué repositorios tengo', quiera ver su lista de repos o enumerar sus proyectos. Devuelve nombre, visibilidad, descripción y URL de cada repositorio.",
    inputSchema: toJsonSchema("list_repositories"),
  },
  {
    name: "create_commit",
    description:
      "Crea o actualiza un archivo dentro de un repositorio de GitHub, lo que genera un commit con el mensaje indicado. Usa este tool cuando el usuario quiera 'commitear', 'guardar cambios', 'agregar un archivo' o 'modificar un archivo' en un repo. Recibe la ruta del archivo, el contenido en texto plano y el mensaje del commit.",
    inputSchema: toJsonSchema("create_commit"),
  },
  {
    name: "list_issues",
    description:
      "Lista los issues de un repositorio de GitHub, filtrando por estado (open, closed o all). Usa este tool cuando el usuario pregunte 'qué issues hay', quiera ver las tareas o problemas de un repo. Devuelve número, título, estado y URL de cada issue.",
    inputSchema: toJsonSchema("list_issues"),
  },
  {
    name: "close_issue",
    description:
      "Cierra un issue abierto en un repositorio de GitHub. Usa este tool cuando el usuario pida cerrar, resolver o finalizar un issue específico. Requiere el número del issue.",
    inputSchema: toJsonSchema("close_issue"),
  },
  {
    name: "create_pull_request",
    description:
      "Abre un pull request en un repositorio de GitHub entre dos ramas. Usa este tool cuando el usuario quiera 'hacer un PR', 'crear un pull request' o 'fusionar cambios de una rama a otra'. Requiere la rama origen (head), la rama destino (base) y un título.",
    inputSchema: toJsonSchema("create_pull_request"),
  },
  {
    name: "list_commits",
    description:
      "Lista los commits recientes de un repositorio de GitHub. Usa este tool cuando el usuario pregunte 'qué commits hay', quiera ver el historial o las últimas modificaciones de un repo. Devuelve el sha, mensaje, autor y fecha de cada commit.",
    inputSchema: toJsonSchema("list_commits"),
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);
