// ABOUTME: SQLite database reader for Things3 checklist items
// ABOUTME: Uses system sqlite3 CLI since AppleScript API doesn't expose checklist data

import { spawn } from 'child_process';
import { createLogger } from './logger.js';

const logger = createLogger('database');

const DB_PATH = `${process.env['HOME']}/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-JODLL/Things Database.thingsdatabase/main.sqlite`;

export interface ChecklistItemRow {
  id: string;
  title: string;
  completed: boolean;
}

/**
 * Execute a SQLite query against the Things3 database
 */
function queryDatabase(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sqlite3', ['-separator', '\t', DB_PATH, sql]);
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('SQLite query timed out after 10s'));
    }, 10000);

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`sqlite3 exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn sqlite3: ${err.message}`));
    });
  });
}

/**
 * Get checklist items for a given TODO ID
 */
export async function getChecklistItems(todoId: string): Promise<ChecklistItemRow[]> {
  // Escape single quotes to prevent SQL injection
  const escapedId = todoId.replace(/'/g, "''");
  const sql = `SELECT uuid, title, status FROM TMChecklistItem WHERE task = '${escapedId}' ORDER BY "index" ASC`;

  try {
    const output = await queryDatabase(sql);
    if (!output) return [];

    return output.split('\n').map((line) => {
      const [id, title, status] = line.split('\t');
      return {
        id: id ?? '',
        title: title ?? '',
        completed: status === '3',
      };
    });
  } catch (error) {
    logger.error('Failed to query checklist items', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}
