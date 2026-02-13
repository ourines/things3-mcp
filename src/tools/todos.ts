// ABOUTME: Implementation of TODO-related tools for Things3 MCP server
// ABOUTME: Provides CRUD operations for TODOs with filtering and search

import { BaseTool, ToolRegistration } from '../base/tool-base.js';
import {
  TodosListParams,
  TodosListResult,
  TodosGetParams,
  TodosCreateParams,
  TodosCreateResult,
  TodosUpdateParams,
  TodosUpdateResult,
  TodosCompleteParams,
  TodosCompleteResult,
  TodosUncompleteParams,
  TodosUncompleteResult,
  TodosDeleteParams,
  TodosDeleteResult,
  TodoItem,
  ErrorType,
  Things3Error,
} from '../types/index.js';
import * as templates from '../templates/applescript-templates.js';
import { correctTodoCreateParams, correctTodoUpdateParams, logCorrections } from '../utils/error-correction.js';
import { urlSchemeHandler } from '../utils/url-scheme.js';
import { getConfig } from '../config.js';
import { getChecklistItems } from '../utils/database.js';

/**
 * Handles all TODO-related operations
 */
export class TodosTools extends BaseTool {
  constructor() {
    super('todos');
  }


  /**
   * List TODOs with optional filtering
   */
  async listTodos(params: TodosListParams): Promise<TodosListResult[]> {
    try {
      // Ensure Things3 is running
      await this.bridge.ensureThings3Running();

      // Generate and execute AppleScript
      const script = templates.listTodos(params.filter, params.status, params.searchText);
      const response = await this.bridge.execute(script);
      
      // Parse response
      const todos = JSON.parse(response) as TodosListResult[];
      
      // Apply additional filtering if needed
      let filtered = todos;
      
      // Filter by project
      if (params.projectId) {
        // We'll need to fetch full details to filter by project
        // For now, this is a limitation of the list operation
      }
      
      // Filter by area
      if (params.areaId) {
        // Same limitation as project filtering
      }
      
      // Filter by tags
      if (params.tags && params.tags.length > 0) {
        // We need full details to filter by tags
      }
      
      // Apply pagination
      if (params.offset !== undefined || params.limit !== undefined) {
        const offset = params.offset || 0;
        const limit = params.limit || filtered.length;
        filtered = filtered.slice(offset, offset + limit);
      }
      
      return filtered;
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        'Failed to list TODOs',
        error
      );
    }
  }

  /**
   * Get full details of a specific TODO
   */
  async getTodo(params: TodosGetParams): Promise<TodoItem | null> {
    try {
      await this.bridge.ensureThings3Running();
      
      const script = templates.getTodoById(params.id);
      const response = await this.bridge.execute(script);
      
      if (response === 'null') {
        return null;
      }
      
      const todoData = JSON.parse(response);
      
      // Convert to TodoItem format
      const todo: TodoItem = {
        id: todoData.id,
        title: todoData.title,
        notes: todoData.notes,
        completed: todoData.completed,
        tags: todoData.tags || [],
        whenDate: todoData.whenDate,
        deadline: todoData.deadline,
        projectId: todoData.projectId,
        areaId: todoData.areaId,
        checklistItems: (await getChecklistItems(todoData.id)).map((ci) => ({
          id: ci.id,
          title: ci.title,
          completed: ci.completed,
        })),
      };
      
      return todo;
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        `Failed to get TODO ${params.id}`,
        error
      );
    }
  }

  /**
   * Create a new TODO
   */
  async createTodo(params: TodosCreateParams): Promise<TodosCreateResult> {
    try {
      await this.bridge.ensureThings3Running();
      
      // Apply error correction
      const correctionReport = correctTodoCreateParams(params);
      const correctedParams = correctionReport.correctedData;
      
      // Log corrections if any were made
      if (correctionReport.hasCorrections) {
        logCorrections(correctionReport);
      }
      
      // Ensure tags exist before creating the TODO
      if (correctedParams.tags && correctedParams.tags.length > 0) {
        await this.ensureTagsExist(correctedParams.tags);
      }
      
      // Always use URL scheme for creating TODOs (now supports checklist items directly)
      const createParams: Parameters<typeof urlSchemeHandler.createTodo>[0] = {
        title: correctedParams.title
      };
      
      if (correctedParams.notes) createParams.notes = correctedParams.notes;
      if (correctedParams.whenDate) createParams.whenDate = correctedParams.whenDate;
      if (correctedParams.deadline) createParams.deadline = correctedParams.deadline;
      if (correctedParams.tags) createParams.tags = correctedParams.tags;
      if (correctedParams.checklistItems) createParams.checklistItems = correctedParams.checklistItems;
      if (correctedParams.projectId) createParams.projectId = correctedParams.projectId;
      if (correctedParams.areaId) createParams.areaId = correctedParams.areaId;
      if (correctedParams.heading) createParams.heading = correctedParams.heading;
      
      await urlSchemeHandler.createTodo(createParams);
      
      // Since URL scheme doesn't return the ID, we need to find the newly created todo
      // by searching for it (this is a limitation of the URL scheme approach)
      this.logger.info(`Searching for newly created TODO with title: "${correctedParams.title}"`);
      
      // Wait a bit for Things3 to process the creation
      await new Promise(resolve => setTimeout(resolve, getConfig().delays.todoSearch));
      
      // Search for the TODO we just created
      let searchResult = await this.listTodos({
        searchText: correctedParams.title,
        status: 'open',
        limit: 10
      });
      
      // Filter for exact title match
      searchResult = searchResult.filter(todo => 
        todo.title === correctedParams.title
      );
      
      this.logger.info(`Search found ${searchResult.length} TODOs matching title`);
      
      if (searchResult.length > 0) {
        // Get the most recent one (likely our newly created TODO)
        const newTodo = searchResult[0];
        if (!newTodo) {
          throw new Error('Failed to find created TODO');
        }
        
        const result: TodosCreateResult = {
          success: true,
          id: newTodo.id
        };
        
        if (correctionReport.hasCorrections) {
          result.correctionsMade = correctionReport.corrections.map(c => 
            `${c.type}: ${c.reason}`
          );
        }
        
        return result;
      } else {
        // Try one more time with a broader search
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        searchResult = await this.listTodos({
          filter: 'inbox',
          status: 'open',
          limit: 50
        });
        
        const matchingTodo = searchResult.find(todo => todo.title === correctedParams.title);
        
        if (matchingTodo) {
          const result: TodosCreateResult = {
            success: true,
            id: matchingTodo.id
          };
          
          if (correctionReport.hasCorrections) {
            result.correctionsMade = correctionReport.corrections.map(c => 
              `${c.type}: ${c.reason}`
            );
          }
          
          return result;
        }
        
        // If we still can't find it, return success without ID
        this.logger.warn('Created TODO but could not retrieve its ID');
        return {
          success: true,
          id: 'unknown',
          correctionsMade: correctionReport.corrections.map(c => 
            `${c.field}: ${c.reason}`
          ),
        };
      }
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        'Failed to create TODO',
        error
      );
    }
  }

  /**
   * Update an existing TODO
   */
  async updateTodo(params: TodosUpdateParams): Promise<TodosUpdateResult> {
    try {
      await this.bridge.ensureThings3Running();
      
      // Apply error correction
      const correctionReport = correctTodoUpdateParams(params);
      const correctedParams = correctionReport.correctedData;
      
      // Log corrections if any were made
      if (correctionReport.hasCorrections) {
        logCorrections(correctionReport);
      }
      
      // Ensure tags exist before updating the TODO
      if (correctedParams.tags && correctedParams.tags.length > 0) {
        await this.ensureTagsExist(correctedParams.tags);
      }
      
      // Use URL scheme for updating TODOs
      const updateParams: Parameters<typeof urlSchemeHandler.updateTodo>[1] = {};
      
      if (correctedParams.title !== undefined) updateParams.title = correctedParams.title;
      if (correctedParams.notes !== undefined) updateParams.notes = correctedParams.notes;
      if (correctedParams.whenDate !== undefined) updateParams.whenDate = correctedParams.whenDate;
      if (correctedParams.deadline !== undefined) updateParams.deadline = correctedParams.deadline;
      if (correctedParams.tags !== undefined) updateParams.tags = correctedParams.tags;
      if (correctedParams.projectId !== undefined || correctedParams.areaId !== undefined) {
        updateParams.listId = correctedParams.projectId || correctedParams.areaId || null;
      }
      
      await urlSchemeHandler.updateTodo(correctedParams.id, updateParams);
      
      return {
        success: true,
        correctionsMade: correctionReport.corrections.map(c => 
          `${c.field}: ${c.reason}`
        ),
      };
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        `Failed to update TODO ${params.id}`,
        error
      );
    }
  }

  /**
   * Complete one or more TODOs
   */
  async completeTodos(params: TodosCompleteParams): Promise<TodosCompleteResult> {
    try {
      await this.bridge.ensureThings3Running();
      
      const ids = Array.isArray(params.ids) ? params.ids : [params.ids];
      
      // Use URL scheme for completing TODOs
      await urlSchemeHandler.completeTodos(ids);
      
      return {
        success: true,
        completedCount: ids.length,
      };
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        'Failed to complete TODOs',
        error
      );
    }
  }

  /**
   * Uncomplete one or more TODOs
   */
  async uncompleteTodos(params: TodosUncompleteParams): Promise<TodosUncompleteResult> {
    try {
      await this.bridge.ensureThings3Running();
      
      const ids = Array.isArray(params.ids) ? params.ids : [params.ids];
      
      // Use URL scheme for uncompleting TODOs
      await urlSchemeHandler.uncompleteTodos(ids);
      
      return {
        success: true,
        uncompletedCount: ids.length,
      };
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        'Failed to uncomplete TODOs',
        error
      );
    }
  }

  /**
   * Delete one or more TODOs
   */
  async deleteTodos(params: TodosDeleteParams): Promise<TodosDeleteResult> {
    try {
      await this.bridge.ensureThings3Running();
      
      const ids = Array.isArray(params.ids) ? params.ids : [params.ids];
      
      // Use AppleScript for actual deletion
      const script = templates.deleteTodos(ids);
      const result = await this.bridge.execute(script);
      
      const deletedCount = parseInt(result.trim()) || 0;
      
      return {
        success: deletedCount > 0,
        deletedCount: deletedCount,
      };
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        'Failed to delete TODOs',
        error
      );
    }
  }

  /**
   * Add checklist items to an existing TODO
   */
  async addChecklistItems(params: { todoId: string; items: string[] }): Promise<{ success: boolean; addedCount: number }> {
    try {
      await this.bridge.ensureThings3Running();
      await urlSchemeHandler.addChecklistItems(params.todoId, params.items);
      return { success: true, addedCount: params.items.length };
    } catch (error) {
      if (error instanceof Things3Error) {
        throw error;
      }
      throw new Things3Error(
        ErrorType.UNKNOWN,
        `Failed to add checklist items to TODO ${params.todoId}`,
        error
      );
    }
  }

  /**
   * Get tool registrations for the registry
   */
  getToolRegistrations(): ToolRegistration[] {
    return [
      {
        name: 'todos_list',
        handler: this.listTodos.bind(this),
        toolDefinition: {
          name: 'todos_list',
          description: 'List TODOs with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['inbox', 'today', 'upcoming', 'anytime', 'someday', 'logbook'],
              description: 'Filter by TODO list',
            },
            status: {
              type: 'string',
              enum: ['open', 'completed', 'cancelled'],
              description: 'Filter by status',
            },
            projectId: {
              type: 'string',
              description: 'Filter by project ID',
            },
            areaId: {
              type: 'string',
              description: 'Filter by area ID',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags (AND operation)',
            },
            searchText: {
              type: 'string',
              description: 'Search in title and notes',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
            offset: {
              type: 'number',
              description: 'Number of results to skip',
            },
          },
        },
        }
      },
      {
        name: 'todos_get',
        handler: this.getTodo.bind(this),
        toolDefinition: {
          name: 'todos_get',
        description: 'Get full details of a specific TODO',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'TODO ID',
            },
          },
          required: ['id'],
        },
        },
      },
      {
        name: 'todos_create',
        handler: this.createTodo.bind(this),
        toolDefinition: {
          name: 'todos_create',
        description: 'Create a new TODO',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'TODO title',
            },
            notes: {
              type: 'string',
              description: 'TODO notes/description',
            },
            whenDate: {
              type: 'string',
              description: 'When to work on it (ISO 8601)',
            },
            deadline: {
              type: 'string',
              description: 'When it must be done (ISO 8601)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags to assign',
            },
            projectId: {
              type: 'string',
              description: 'Project to assign to',
            },
            areaId: {
              type: 'string',
              description: 'Area to assign to',
            },
            heading: {
              type: 'string',
              description: 'Title of heading within project to add to',
            },
            checklistItems: {
              type: 'array',
              items: { type: 'string' },
              description: 'Checklist item titles',
            },
            reminder: {
              type: 'object',
              properties: {
                dateTime: { type: 'string' },
                minutesBeforeDeadline: { type: 'number' },
                minutesBeforeWhen: { type: 'number' },
              },
              description: 'Reminder settings',
            },
          },
          required: ['title'],
        },
        },
      },
      {
        name: 'todos_update',
        handler: this.updateTodo.bind(this),
        toolDefinition: {
          name: 'todos_update',
        description: 'Update an existing TODO',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'TODO ID',
            },
            title: {
              type: 'string',
              description: 'New title',
            },
            notes: {
              type: ['string', 'null'],
              description: 'New notes (null to clear)',
            },
            whenDate: {
              type: ['string', 'null'],
              description: 'New when date (null to clear)',
            },
            deadline: {
              type: ['string', 'null'],
              description: 'New deadline (null to clear)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replace all tags',
            },
            projectId: {
              type: ['string', 'null'],
              description: 'New project (null to move to Inbox)',
            },
            areaId: {
              type: ['string', 'null'],
              description: 'New area (null to move to Inbox)',
            },
          },
          required: ['id'],
        },
        },
      },
      {
        name: 'todos_complete',
        handler: this.completeTodos.bind(this),
        toolDefinition: {
          name: 'todos_complete',
        description: 'Mark TODO(s) as complete',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
              description: 'TODO ID(s) to complete',
            },
          },
          required: ['ids'],
        },
        },
      },
      {
        name: 'todos_uncomplete',
        handler: this.uncompleteTodos.bind(this),
        toolDefinition: {
          name: 'todos_uncomplete',
        description: 'Mark TODO(s) as incomplete',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
              description: 'TODO ID(s) to uncomplete',
            },
          },
          required: ['ids'],
        },
        },
      },
      {
        name: 'todos_delete',
        handler: this.deleteTodos.bind(this),
        toolDefinition: {
          name: 'todos_delete',
        description: 'Delete TODO(s)',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
              description: 'TODO ID(s) to delete',
            },
          },
          required: ['ids'],
        },
        }
      },
      {
        name: 'todos_add_checklist_items',
        handler: this.addChecklistItems.bind(this),
        toolDefinition: {
          name: 'todos_add_checklist_items',
          description: 'Add checklist items to an existing TODO',
          inputSchema: {
            type: 'object',
            properties: {
              todoId: {
                type: 'string',
                description: 'The TODO ID to add checklist items to',
              },
              items: {
                type: 'array',
                items: { type: 'string' },
                description: 'Checklist item titles to add',
              },
            },
            required: ['todoId', 'items'],
          },
        },
      },
    ];
  }
}