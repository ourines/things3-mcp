// ABOUTME: MCP Resources implementation for Things3 integration
// ABOUTME: Exposes Things3 data as readable resources (lists, projects, areas, tags, individual items)

import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { TodosTools } from './tools/todos.js';
import { ProjectTools } from './tools/projects.js';
import { AreaTools } from './tools/areas.js';
import { TagTools } from './tools/tags.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('resources');

interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

const STATIC_RESOURCES: ResourceDefinition[] = [
  { uri: 'things3://inbox', name: 'Inbox', description: 'TODOs in the Inbox', mimeType: 'application/json' },
  { uri: 'things3://today', name: 'Today', description: 'TODOs scheduled for today', mimeType: 'application/json' },
  { uri: 'things3://upcoming', name: 'Upcoming', description: 'TODOs scheduled for upcoming dates', mimeType: 'application/json' },
  { uri: 'things3://anytime', name: 'Anytime', description: 'TODOs available anytime', mimeType: 'application/json' },
  { uri: 'things3://someday', name: 'Someday', description: 'TODOs deferred to someday', mimeType: 'application/json' },
  { uri: 'things3://logbook', name: 'Logbook', description: 'Completed TODOs', mimeType: 'application/json' },
  { uri: 'things3://projects', name: 'All Projects', description: 'List of all projects', mimeType: 'application/json' },
  { uri: 'things3://areas', name: 'All Areas', description: 'List of all areas', mimeType: 'application/json' },
  { uri: 'things3://tags', name: 'All Tags', description: 'List of all tags', mimeType: 'application/json' },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'things3://todos/{todoId}',
    name: 'TODO Detail',
    description: 'Full details of a specific TODO by ID',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'things3://projects/{projectId}',
    name: 'Project Detail',
    description: 'Full details of a specific project by ID',
    mimeType: 'application/json',
  },
];

type FilterType = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'logbook';

const FILTER_MAP: Record<string, FilterType> = {
  'things3://inbox': 'inbox',
  'things3://today': 'today',
  'things3://upcoming': 'upcoming',
  'things3://anytime': 'anytime',
  'things3://someday': 'someday',
  'things3://logbook': 'logbook',
};

export function registerResources(
  server: Server,
  todosTools: TodosTools,
  projectTools: ProjectTools,
  areaTools: AreaTools,
  tagTools: TagTools,
): void {
  // List static resources
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: STATIC_RESOURCES.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    };
  });

  // List resource templates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return { resourceTemplates: RESOURCE_TEMPLATES };
  });

  // Read resource content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
    const uri: string = request.params.uri;
    logger.info(`Reading resource: ${uri}`);

    try {
      const content = await readResource(uri, todosTools, projectTools, areaTools, tagTools);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to read resource ${uri}`, error instanceof Error ? error : new Error(message));
      throw new Error(`Failed to read resource ${uri}: ${message}`);
    }
  });

  logger.info(`Registered ${STATIC_RESOURCES.length} resources and ${RESOURCE_TEMPLATES.length} resource templates`);
}

async function readResource(
  uri: string,
  todosTools: TodosTools,
  projectTools: ProjectTools,
  areaTools: AreaTools,
  tagTools: TagTools,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // Check static list resources
  const filter = FILTER_MAP[uri];
  if (filter) {
    const todos = await todosTools.listTodos({ filter });
    return todos;
  }

  if (uri === 'things3://projects') {
    const result = await projectTools.listProjects({});
    return result.projects;
  }

  if (uri === 'things3://areas') {
    const result = await areaTools.listAreas();
    return result.areas;
  }

  if (uri === 'things3://tags') {
    const result = await tagTools.listTags();
    return result.tags;
  }

  // Check dynamic resource templates
  const todoMatch = uri.match(/^things3:\/\/todos\/(.+)$/);
  if (todoMatch?.[1]) {
    const todo = await todosTools.getTodo({ id: todoMatch[1] });
    if (!todo) {
      throw new Error(`TODO not found: ${todoMatch[1]}`);
    }
    return todo;
  }

  const projectMatch = uri.match(/^things3:\/\/projects\/(.+)$/);
  if (projectMatch?.[1]) {
    const result = await projectTools.getProject({ id: projectMatch[1] });
    return result.project;
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}
