// ABOUTME: AppleScript template functions for generating Things3 commands
// ABOUTME: Provides type-safe template generation for all Things3 operations

import { AppleScriptBridge } from '../utils/applescript.js';
import { TodoFilter, TodoStatus } from '../types/index.js';

const bridge = new AppleScriptBridge();

/**
 * Generate AppleScript to list TODOs with filtering
 */
export function listTodos(
  filter?: TodoFilter,
  status?: TodoStatus,
  searchText?: string
): string {
  let script = `use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

tell application "Things3"\n`;
  
  // Determine which list to query
  let listName = 'to dos';
  if (filter) {
    switch (filter) {
      case 'inbox':
        listName = 'to dos of list "Inbox"';
        break;
      case 'today':
        listName = 'to dos of list "Today"';
        break;
      case 'upcoming':
        listName = 'to dos of list "Upcoming"';
        break;
      case 'anytime':
        listName = 'to dos of list "Anytime"';
        break;
      case 'someday':
        listName = 'to dos of list "Someday"';
        break;
      case 'logbook':
        listName = 'to dos of list "Logbook"';
        break;
    }
  }
  
  script += `  set todoList to ${listName}\n`;
  script += '  set resultArray to current application\'s NSMutableArray\'s array()\n';
  script += '  repeat with t in todoList\n';
  
  // Apply status filter
  if (status) {
    if (status === 'open') {
      script += '    if status of t is open then\n';
    } else if (status === 'completed') {
      script += '    if status of t is completed then\n';
    } else if (status === 'cancelled') {
      script += '    if status of t is canceled then\n';
    }
  }
  
  // Apply search text filter
  if (searchText) {
    const escaped = bridge.escapeString(searchText);
    script += `    if (name of t contains "${escaped}" or notes of t contains "${escaped}") then\n`;
  }
  
  // Build result using NSMutableDictionary for proper JSON serialization
  script += '      set todoDict to current application\'s NSMutableDictionary\'s dictionary()\n';
  script += '      todoDict\'s setObject:(id of t) forKey:"id"\n';
  script += '      todoDict\'s setObject:(name of t) forKey:"title"\n';
  script += '      todoDict\'s setObject:(status of t is completed) forKey:"completed"\n';
  script += '      resultArray\'s addObject:todoDict\n';
  
  // Close conditionals
  if (searchText) {
    script += '    end if\n';
  }
  if (status) {
    script += '    end if\n';
  }
  
  script += '  end repeat\n';
  script += '  \n';
  script += '  -- Convert to JSON\n';
  script += '  set jsonData to current application\'s NSJSONSerialization\'s dataWithJSONObject:resultArray options:0 |error|:(missing value)\n';
  script += '  if jsonData is missing value then\n';
  script += '    return "[]"\n';
  script += '  else\n';
  script += '    set jsonString to current application\'s NSString\'s alloc()\'s initWithData:jsonData encoding:(current application\'s NSUTF8StringEncoding)\n';
  script += '    return jsonString as text\n';
  script += '  end if\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to get a TODO by ID
 */
export function getTodoById(id: string): string {
  const escapedId = bridge.escapeString(id);
  
  return `
use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

tell application "Things3"
  try
    set t to to do id "${escapedId}"
    
    -- Get tags
    set tagList to {}
    repeat with tg in tags of t
      set end of tagList to (name of tg as text)
    end repeat
    
    -- Create dictionary for JSON serialization
    set todoDict to current application's NSMutableDictionary's dictionary()
    todoDict's setObject:(id of t) forKey:"id"
    todoDict's setObject:(name of t) forKey:"title"
    todoDict's setObject:(status of t is completed) forKey:"completed"
    
    -- Add optional fields
    if notes of t is not missing value and notes of t is not "" then
      todoDict's setObject:(notes of t) forKey:"notes"
    end if
    
    if activation date of t is not missing value then
      todoDict's setObject:(activation date of t as string) forKey:"whenDate"
    end if
    
    if due date of t is not missing value then
      todoDict's setObject:(due date of t as string) forKey:"deadline"
    end if
    
    -- Convert tag list to NSArray
    set nsTagArray to current application's NSArray's arrayWithArray:tagList
    todoDict's setObject:nsTagArray forKey:"tags"
    
    if project of t is not missing value then
      todoDict's setObject:(id of project of t) forKey:"projectId"
    end if
    
    if area of t is not missing value then
      todoDict's setObject:(id of area of t) forKey:"areaId"
    end if
    
    -- Convert to JSON
    set jsonData to current application's NSJSONSerialization's dataWithJSONObject:todoDict options:0 |error|:(missing value)
    if jsonData is missing value then
      return "null"
    else
      set jsonString to current application's NSString's alloc()'s initWithData:jsonData encoding:(current application's NSUTF8StringEncoding)
      return jsonString as text
    end if
    
  on error errMsg
    return "null"
  end try
end tell`;
}

/**
 * Generate AppleScript to create a new TODO
 */
export function createTodo(
  title: string,
  notes?: string,
  whenDate?: string,
  deadline?: string,
  tags?: string[],
  projectId?: string,
  areaId?: string
): string {
  const escapedTitle = bridge.escapeString(title);
  const escapedNotes = notes ? bridge.escapeString(notes) : '';
  
  let script = 'tell application "Things3"\n';
  
  // Create the basic todo
  script += `  set newTodo to make new to do with properties {name:"${escapedTitle}"`;
  
  if (notes) {
    script += `, notes:"${escapedNotes}"`;
  }
  
  script += '}\n';
  
  // Schedule if when date provided
  if (whenDate) {
    script += `  schedule newTodo for date "${whenDate}"\n`;
  }
  
  if (deadline) {
    script += `  set due date of newTodo to date "${deadline}"\n`;
  }
  
  // Add tags if provided
  if (tags && tags.length > 0) {
    const tagList = tags.map(tag => bridge.escapeString(tag)).join(',');
    script += `  set tag names of newTodo to "${tagList}"\n`;
  }
  
  // Assign to project or area if specified
  if (projectId) {
    script += `  set project of newTodo to project id "${bridge.escapeString(projectId)}"\n`;
  } else if (areaId) {
    script += `  set area of newTodo to area id "${bridge.escapeString(areaId)}"\n`;
  }
  
  script += '  return id of newTodo\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to update a TODO
 */
export function updateTodo(
  id: string,
  updates: {
    title?: string;
    notes?: string | null;
    whenDate?: string | null;
    deadline?: string | null;
    tags?: string[];
    projectId?: string | null;
    areaId?: string | null;
  }
): string {
  const escapedId = bridge.escapeString(id);
  
  let script = 'tell application "Things3"\n';
  script += `  set t to to do id "${escapedId}"\n`;
  
  // Update basic properties
  if (updates.title !== undefined) {
    script += `  set name of t to "${bridge.escapeString(updates.title)}"\n`;
  }
  
  if (updates.notes !== undefined) {
    if (updates.notes === null) {
      script += '  set notes of t to missing value\n';
    } else {
      script += `  set notes of t to "${bridge.escapeString(updates.notes)}"\n`;
    }
  }
  
  // Update dates
  if (updates.whenDate !== undefined) {
    if (updates.whenDate === null) {
      script += '  set activation date of t to missing value\n';
    } else {
      script += `  schedule t for date "${updates.whenDate}"\n`;
    }
  }
  
  if (updates.deadline !== undefined) {
    if (updates.deadline === null) {
      script += '  set due date of t to missing value\n';
    } else {
      script += `  set due date of t to date "${updates.deadline}"\n`;
    }
  }
  
  // Update tags (replace all)
  if (updates.tags !== undefined) {
    const tagList = updates.tags.map(tag => bridge.escapeString(tag)).join(',');
    script += `  set tag names of t to "${tagList}"\n`;
  }
  
  // Assign to new project/area
  if (updates.projectId !== undefined) {
    if (updates.projectId === null) {
      script += '  set project of t to missing value\n';
      script += '  set area of t to missing value\n';
    } else {
      script += `  set project of t to project id "${bridge.escapeString(updates.projectId)}"\n`;
    }
  } else if (updates.areaId !== undefined) {
    if (updates.areaId === null) {
      script += '  set project of t to missing value\n';
      script += '  set area of t to missing value\n';
    } else {
      script += `  set area of t to area id "${bridge.escapeString(updates.areaId)}"\n`;
    }
  }
  
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to complete TODOs
 */
export function completeTodos(ids: string[]): string {
  let script = 'tell application "Things3"\n';
  script += '  set completedCount to 0\n';
  
  for (const id of ids) {
    const escapedId = bridge.escapeString(id);
    script += '  try\n';
    script += `    set t to to do id "${escapedId}"\n`;
    script += '    if status of t is open then\n';
    script += '      set status of t to completed\n';
    script += '      set completedCount to completedCount + 1\n';
    script += '    end if\n';
    script += '  end try\n';
  }
  
  script += '  return completedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to uncomplete TODOs
 */
export function uncompleteTodos(ids: string[]): string {
  let script = 'tell application "Things3"\n';
  script += '  set uncompletedCount to 0\n';
  
  for (const id of ids) {
    const escapedId = bridge.escapeString(id);
    script += '  try\n';
    script += `    set t to to do id "${escapedId}"\n`;
    script += '    if status of t is completed then\n';
    script += '      set status of t to open\n';
    script += '      set uncompletedCount to uncompletedCount + 1\n';
    script += '    end if\n';
    script += '  end try\n';
  }
  
  script += '  return uncompletedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to delete TODOs
 */
export function deleteTodos(ids: string[]): string {
  let script = 'tell application "Things3"\n';
  script += '  set deletedCount to 0\n';
  
  for (const id of ids) {
    const escapedId = bridge.escapeString(id);
    script += '  try\n';
    script += `    set t to to do id "${escapedId}"\n`;
    script += '    delete t\n';
    script += '    set deletedCount to deletedCount + 1\n';
    script += '  end try\n';
  }
  
  script += '  return deletedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to list projects
 */
export function listProjects(areaId?: string, includeCompleted?: boolean): string {
  let script = `use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

tell application "Things3"\n`;
  
  // Determine which projects to list
  let projectList = 'projects';
  if (areaId) {
    const escapedAreaId = bridge.escapeString(areaId);
    projectList = `projects of area id "${escapedAreaId}"`;
  }
  
  script += `  set projectList to ${projectList}\n`;
  script += '  set resultArray to current application\'s NSMutableArray\'s array()\n';
  script += '  repeat with p in projectList\n';
  
  // Filter by completion status if specified
  if (includeCompleted === false) {
    script += '    if status of p is open then\n';
  }
  
  // Build result using NSMutableDictionary
  script += '      set projectDict to current application\'s NSMutableDictionary\'s dictionary()\n';
  script += '      projectDict\'s setObject:(id of p) forKey:"id"\n';
  script += '      projectDict\'s setObject:(name of p) forKey:"name"\n';
  script += '      projectDict\'s setObject:(status of p is completed) forKey:"completed"\n';
  script += '      \n';
  script += '      -- Handle optional area reference\n';
  script += '      set areaRef to area of p\n';
  script += '      if areaRef is not missing value then\n';
  script += '        projectDict\'s setObject:(id of areaRef) forKey:"areaId"\n';
  script += '      end if\n';
  script += '      \n';
  script += '      resultArray\'s addObject:projectDict\n';
  
  if (includeCompleted === false) {
    script += '    end if\n';
  }
  
  script += '  end repeat\n';
  script += '  \n';
  script += '  -- Convert to JSON\n';
  script += '  set jsonData to current application\'s NSJSONSerialization\'s dataWithJSONObject:resultArray options:0 |error|:(missing value)\n';
  script += '  if jsonData is missing value then\n';
  script += '    return "[]"\n';
  script += '  else\n';
  script += '    set jsonString to current application\'s NSString\'s alloc()\'s initWithData:jsonData encoding:(current application\'s NSUTF8StringEncoding)\n';
  script += '    return jsonString as text\n';
  script += '  end if\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to list areas
 */
export function listAreas(): string {
  let script = `use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

tell application "Things3"\n`;
  script += '  set areaList to areas\n';
  script += '  set resultArray to current application\'s NSMutableArray\'s array()\n';
  script += '  repeat with a in areaList\n';
  
  // Note: Areas in Things3 don't have a visible property, so we ignore includeHidden
  
  // Build result using NSMutableDictionary
  script += '    set areaDict to current application\'s NSMutableDictionary\'s dictionary()\n';
  script += '    areaDict\'s setObject:(id of a) forKey:"id"\n';
  script += '    areaDict\'s setObject:(name of a) forKey:"name"\n';
  script += '    areaDict\'s setObject:true forKey:"visible"\n'; // Always true since we can't filter
  script += '    resultArray\'s addObject:areaDict\n';
  
  script += '  end repeat\n';
  script += '  \n';
  script += '  -- Convert to JSON\n';
  script += '  set jsonData to current application\'s NSJSONSerialization\'s dataWithJSONObject:resultArray options:0 |error|:(missing value)\n';
  script += '  if jsonData is missing value then\n';
  script += '    return "[]"\n';
  script += '  else\n';
  script += '    set jsonString to current application\'s NSString\'s alloc()\'s initWithData:jsonData encoding:(current application\'s NSUTF8StringEncoding)\n';
  script += '    return jsonString as text\n';
  script += '  end if\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to get a project by ID
 */
export function getProjectById(id: string): string {
  const escapedId = bridge.escapeString(id);
  
  return `
use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

tell application "Things3"
  try
    set p to project id "${escapedId}"
    
    -- Get tags
    set tagList to {}
    repeat with tg in tags of p
      set end of tagList to (name of tg as text)
    end repeat
    
    -- Get headings (sections within project)
    set headingsList to current application's NSMutableArray's array()
    repeat with h in to dos of p
      if class of h is project then
        set headingDict to current application's NSMutableDictionary's dictionary()
        headingDict's setObject:(id of h) forKey:"id"
        headingDict's setObject:(name of h) forKey:"title"
        headingsList's addObject:headingDict
      end if
    end repeat
    
    -- Create dictionary instead of record to avoid missing value issues
    set projectDict to current application's NSMutableDictionary's dictionary()
    projectDict's setObject:(id of p) forKey:"id"
    projectDict's setObject:(name of p) forKey:"name"
    projectDict's setObject:(status of p is completed) forKey:"completed"
    
    -- Add optional fields
    if notes of p is not missing value and notes of p is not "" then
      projectDict's setObject:(notes of p) forKey:"notes"
    end if
    
    if activation date of p is not missing value then
      projectDict's setObject:(activation date of p as string) forKey:"whenDate"
    end if
    
    if due date of p is not missing value then
      projectDict's setObject:(due date of p as string) forKey:"deadline"
    end if
    
    -- Convert tag list to NSArray
    set nsTagArray to current application's NSArray's arrayWithArray:tagList
    projectDict's setObject:nsTagArray forKey:"tags"
    
    if area of p is not missing value then
      projectDict's setObject:(id of area of p) forKey:"areaId"
    end if
    
    -- Add headings array
    projectDict's setObject:headingsList forKey:"headings"
    
    -- Convert to JSON
    set jsonData to current application's NSJSONSerialization's dataWithJSONObject:projectDict options:0 |error|:(missing value)
    if jsonData is missing value then
      return "null"
    else
      set jsonString to current application's NSString's alloc()'s initWithData:jsonData encoding:(current application's NSUTF8StringEncoding)
      return jsonString as text
    end if
    
  on error errMsg
    return "null"
  end try
end tell`;
}

/**
 * Generate AppleScript to create a new project
 */
export function createProject(
  name: string,
  notes?: string,
  whenDate?: string,
  deadline?: string,
  tags?: string[],
  areaId?: string,
  headings?: string[]
): string {
  const escapedName = bridge.escapeString(name);
  const escapedNotes = notes ? bridge.escapeString(notes) : '';
  
  let script = 'tell application "Things3"\n';
  
  // Create the basic project
  script += `  set newProject to make new project with properties {name:"${escapedName}"`;
  
  if (notes) {
    script += `, notes:"${escapedNotes}"`;
  }
  
  script += '}\n';
  
  // Schedule if when date provided
  if (whenDate) {
    script += `  schedule newProject for date "${whenDate}"\n`;
  }
  
  if (deadline) {
    script += `  set due date of newProject to date "${deadline}"\n`;
  }
  
  // Add tags if provided
  if (tags && tags.length > 0) {
    const tagList = tags.map(tag => bridge.escapeString(tag)).join(',');
    script += `  set tag names of newProject to "${tagList}"\n`;
  }
  
  // Move to area if specified
  if (areaId) {
    script += `  move newProject to area id "${bridge.escapeString(areaId)}"\n`;
  }
  
  // Create headings if provided
  if (headings && headings.length > 0) {
    headings.forEach(heading => {
      const escapedHeading = bridge.escapeString(heading);
      script += `  make new project with properties {name:"${escapedHeading}"} at beginning of newProject\n`;
    });
  }
  
  script += '  return id of newProject\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to update a project
 */
export function updateProject(
  id: string,
  updates: {
    name?: string;
    notes?: string | null;
    whenDate?: string | null;
    deadline?: string | null;
    tags?: string[];
    areaId?: string | null;
  }
): string {
  const escapedId = bridge.escapeString(id);
  
  let script = 'tell application "Things3"\n';
  script += `  set p to project id "${escapedId}"\n`;
  
  // Update basic properties
  if (updates.name !== undefined) {
    script += `  set name of p to "${bridge.escapeString(updates.name)}"\n`;
  }
  
  if (updates.notes !== undefined) {
    if (updates.notes === null) {
      script += '  set notes of p to missing value\n';
    } else {
      script += `  set notes of p to "${bridge.escapeString(updates.notes)}"\n`;
    }
  }
  
  // Update dates
  if (updates.whenDate !== undefined) {
    if (updates.whenDate === null) {
      script += '  set activation date of p to missing value\n';
    } else {
      script += `  schedule p for date "${updates.whenDate}"\n`;
    }
  }
  
  if (updates.deadline !== undefined) {
    if (updates.deadline === null) {
      script += '  set due date of p to missing value\n';
    } else {
      script += `  set due date of p to date "${updates.deadline}"\n`;
    }
  }
  
  // Update tags (replace all)
  if (updates.tags !== undefined) {
    const tagList = updates.tags.map(tag => bridge.escapeString(tag)).join(',');
    script += `  set tag names of p to "${tagList}"\n`;
  }
  
  // Move to new area
  if (updates.areaId !== undefined) {
    if (updates.areaId === null) {
      // Remove from area (move to top level)
      script += '  set area of p to missing value\n';
    } else {
      script += `  move p to area id "${bridge.escapeString(updates.areaId)}"\n`;
    }
  }
  
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to complete a project
 */
export function completeProject(id: string): string {
  const escapedId = bridge.escapeString(id);
  
  return `
tell application "Things3"
  try
    set p to project id "${escapedId}"
    if status of p is open then
      set status of p to completed
      return true
    else
      return false
    end if
  on error
    return false
  end try
end tell`;
}

/**
 * Generate AppleScript to create a new area
 */
export function createArea(name: string): string {
  const escapedName = bridge.escapeString(name);
  
  return `
tell application "Things3"
  set newArea to make new area with properties {name:"${escapedName}"}
  return id of newArea
end tell`;
}

/**
 * Generate AppleScript to create a new tag
 */
export function createTag(name: string, parentTagId?: string): string {
  const escapedName = bridge.escapeString(name);
  
  let script = 'tell application "Things3"\n';
  
  if (parentTagId) {
    const escapedParentId = bridge.escapeString(parentTagId);
    // Create as a child of an existing tag
    script += `  try\n`;
    script += `    set parentTag to tag id "${escapedParentId}"\n`;
    script += `    set newTag to make new tag with properties {name:"${escapedName}"} at parentTag\n`;
    script += `    return id of newTag\n`;
    script += `  on error\n`;
    script += `    -- If parent not found, create at top level\n`;
    script += `    set newTag to make new tag with properties {name:"${escapedName}"}\n`;
    script += `    return id of newTag\n`;
    script += `  end try\n`;
  } else {
    // Create at top level
    script += `  set newTag to make new tag with properties {name:"${escapedName}"}\n`;
    script += '  return id of newTag\n';
  }
  
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to add tags to items (TODOs or Projects)
 */
export function addTagsToItems(itemIds: string[], tags: string[]): string {
  let script = 'tell application "Things3"\n';
  script += '  set updatedCount to 0\n';
  
  // Convert tags to comma-separated string
  const newTagsString = tags.map(tag => bridge.escapeString(tag)).join(',');
  script += `  set newTagsString to "${newTagsString}"\n`;
  
  for (const itemId of itemIds) {
    const escapedId = bridge.escapeString(itemId);
    script += '  try\n';
    // Try as a to do first
    script += `    set targetItem to to do id "${escapedId}"\n`;
    script += `    set currentTags to tag names of targetItem\n`;
    script += `    if currentTags is missing value or currentTags is "" then\n`;
    script += `      set tag names of targetItem to newTagsString\n`;
    script += `    else\n`;
    script += `      set tag names of targetItem to currentTags & "," & newTagsString\n`;
    script += `    end if\n`;
    script += '    set updatedCount to updatedCount + 1\n';
    script += '  on error\n';
    script += '    try\n';
    // If not a todo, try as a project
    script += `      set targetItem to project id "${escapedId}"\n`;
    script += `      set currentTags to tag names of targetItem\n`;
    script += `      if currentTags is missing value or currentTags is "" then\n`;
    script += `        set tag names of targetItem to newTagsString\n`;
    script += `      else\n`;
    script += `        set tag names of targetItem to currentTags & "," & newTagsString\n`;
    script += `      end if\n`;
    script += '      set updatedCount to updatedCount + 1\n';
    script += '    end try\n';
    script += '  end try\n';
  }
  
  script += '  return updatedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to remove tags from items
 */
export function removeTagsFromItems(itemIds: string[], tags: string[]): string {
  // Build a reusable subroutine that uses text item delimiters for reliable
  // tag removal regardless of tag length or special characters.
  let script = 'on removeTag(tagList, tagToRemove)\n';
  script += '  set AppleScript\'s text item delimiters to ","\n';
  script += '  set tagItems to text items of tagList\n';
  script += '  set newItems to {}\n';
  script += '  repeat with t in tagItems\n';
  script += '    -- Trim leading/trailing spaces from each tag\n';
  script += '    set t to (do shell script "echo " & quoted form of (t as string) & " | sed \'s/^ *//;s/ *$//\'")\n';
  script += '    if t is not equal to tagToRemove then\n';
  script += '      set end of newItems to t\n';
  script += '    end if\n';
  script += '  end repeat\n';
  script += '  set AppleScript\'s text item delimiters to ", "\n';
  script += '  set result to newItems as string\n';
  script += '  set AppleScript\'s text item delimiters to ""\n';
  script += '  return result\n';
  script += 'end removeTag\n\n';

  script += 'tell application "Things3"\n';
  script += '  set updatedCount to 0\n';

  for (const itemId of itemIds) {
    const escapedId = bridge.escapeString(itemId);
    script += '  try\n';
    // Try as a to do first
    script += `    set targetItem to to do id "${escapedId}"\n`;
    script += '    set currentTags to tag names of targetItem\n';
    script += '    if currentTags is not missing value and currentTags is not "" then\n';
    script += '      set originalTags to currentTags\n';

    for (const tag of tags) {
      const escapedTag = bridge.escapeString(tag);
      script += `      set currentTags to my removeTag(currentTags, "${escapedTag}")\n`;
    }

    script += '      if currentTags is not equal to originalTags then\n';
    script += '        set tag names of targetItem to currentTags\n';
    script += '        set updatedCount to updatedCount + 1\n';
    script += '      end if\n';
    script += '    end if\n';
    script += '  on error\n';
    script += '    try\n';
    // Same logic for projects
    script += `      set targetItem to project id "${escapedId}"\n`;
    script += '      set currentTags to tag names of targetItem\n';
    script += '      if currentTags is not missing value and currentTags is not "" then\n';
    script += '        set originalTags to currentTags\n';

    for (const tag of tags) {
      const escapedTag = bridge.escapeString(tag);
      script += `        set currentTags to my removeTag(currentTags, "${escapedTag}")\n`;
    }

    script += '        if currentTags is not equal to originalTags then\n';
    script += '          set tag names of targetItem to currentTags\n';
    script += '          set updatedCount to updatedCount + 1\n';
    script += '        end if\n';
    script += '      end if\n';
    script += '    end try\n';
    script += '  end try\n';
  }

  script += '  return updatedCount\n';
  script += 'end tell';

  return script;
}

/**
 * Generate AppleScript to delete tags by name
 */
export function deleteTags(tagNames: string[]): string {
  let script = 'tell application "Things3"\n';
  script += '  set deletedCount to 0\n';
  
  for (const tagName of tagNames) {
    const escapedName = bridge.escapeString(tagName);
    script += '  try\n';
    script += `    set aTag to tag "${escapedName}"\n`;
    script += '    delete aTag\n';
    script += '    set deletedCount to deletedCount + 1\n';
    script += '  end try\n';
  }
  
  script += '  return deletedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to list tags
 */
export function listTags(): string {
  let script = `use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

tell application "Things3"\n`;
  script += '  set tagList to tags\n';
  script += '  set resultArray to current application\'s NSMutableArray\'s array()\n';
  script += '  repeat with t in tagList\n';
  
  // Build result using NSMutableDictionary
  script += '    set tagDict to current application\'s NSMutableDictionary\'s dictionary()\n';
  script += '    tagDict\'s setObject:(id of t) forKey:"id"\n';
  script += '    tagDict\'s setObject:(name of t) forKey:"name"\n';
  script += '    \n';
  script += '    -- Handle optional parent tag\n';
  script += '    set parentRef to parent tag of t\n';
  script += '    if parentRef is not missing value then\n';
  script += '      tagDict\'s setObject:(id of parentRef) forKey:"parentTagId"\n';
  script += '    end if\n';
  script += '    \n';
  script += '    resultArray\'s addObject:tagDict\n';
  
  script += '  end repeat\n';
  script += '  \n';
  script += '  -- Convert to JSON\n';
  script += '  set jsonData to current application\'s NSJSONSerialization\'s dataWithJSONObject:resultArray options:0 |error|:(missing value)\n';
  script += '  if jsonData is missing value then\n';
  script += '    return "[]"\n';
  script += '  else\n';
  script += '    set jsonString to current application\'s NSString\'s alloc()\'s initWithData:jsonData encoding:(current application\'s NSUTF8StringEncoding)\n';
  script += '    return jsonString as text\n';
  script += '  end if\n';
  script += 'end tell';
  
  return script;
}


/**
 * Generate AppleScript to bulk move TODOs to a project or area
 */
export function bulkMoveTodos(
  todoIds: string[],
  projectId?: string,
  areaId?: string
): string {
  let script = 'tell application "Things3"\n';
  script += '  set movedCount to 0\n';
  
  for (const todoId of todoIds) {
    const escapedId = bridge.escapeString(todoId);
    script += '  try\n';
    script += `    set t to to do id "${escapedId}"\n`;
    
    if (projectId) {
      const escapedProjectId = bridge.escapeString(projectId);
      script += `    set targetProject to project id "${escapedProjectId}"\n`;
      script += '    set project of t to targetProject\n';
    } else if (areaId) {
      const escapedAreaId = bridge.escapeString(areaId);
      script += `    set targetArea to area id "${escapedAreaId}"\n`;
      script += '    set area of t to targetArea\n';
    } else {
      // Move to inbox if neither project nor area specified
      script += '    set project of t to missing value\n';
      script += '    set area of t to missing value\n';
    }
    
    script += '    set movedCount to movedCount + 1\n';
    script += '  on error\n';
    script += '    -- Skip if todo not found\n';
    script += '  end try\n';
  }
  
  script += '  return movedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to bulk update dates for multiple TODOs
 */
export function bulkUpdateDates(
  todoIds: string[],
  whenDate?: string | null,
  deadline?: string | null
): string {
  let script = 'tell application "Things3"\n';
  script += '  set updatedCount to 0\n';
  
  for (const todoId of todoIds) {
    const escapedId = bridge.escapeString(todoId);
    script += '  try\n';
    script += `    set t to to do id "${escapedId}"\n`;
    
    // Update when date
    if (whenDate !== undefined) {
      if (whenDate === null) {
        script += '    set activation date of t to missing value\n';
      } else {
        script += `    schedule t for date "${whenDate}"\n`;
      }
    }
    
    // Update deadline
    if (deadline !== undefined) {
      if (deadline === null) {
        script += '    set due date of t to missing value\n';
      } else {
        script += `    set due date of t to date "${deadline}"\n`;
      }
    }
    
    script += '    set updatedCount to updatedCount + 1\n';
    script += '  on error\n';
    script += '    -- Skip if todo not found\n';
    script += '  end try\n';
  }
  
  script += '  return updatedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to search the logbook
 */
export function searchLogbook(
  searchText?: string,
  fromDate?: string,
  toDate?: string,
  limit?: number
): string {
  let script = `use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

tell application "Things3"\n`;
  script += '  set logbookItems to to dos of list "Logbook"\n';
  script += '  set resultArray to current application\'s NSMutableArray\'s array()\n';
  script += '  set resultCount to 0\n';
  const maxResults = limit || 100;
  
  script += '  repeat with t in logbookItems\n';
  script += `    if resultCount < ${maxResults} then\n`;
  script += '      set shouldInclude to true\n';
  
  // Apply search text filter
  if (searchText) {
    const escaped = bridge.escapeString(searchText);
    script += `      if not (name of t contains "${escaped}" or notes of t contains "${escaped}") then\n`;
    script += '        set shouldInclude to false\n';
    script += '      end if\n';
  }
  
  // Apply date range filter with actual date comparison
  if (fromDate || toDate) {
    script += '      set completionDate to completion date of t\n';
    script += '      if completionDate is missing value then\n';
    script += '        set shouldInclude to false\n';
    script += '      else\n';
    if (fromDate) {
      script += `        set fromDateObj to date "${fromDate}"\n`;
      script += '        if completionDate < fromDateObj then\n';
      script += '          set shouldInclude to false\n';
      script += '        end if\n';
    }
    if (toDate) {
      script += `        set toDateObj to date "${toDate}"\n`;
      script += '        if completionDate > toDateObj then\n';
      script += '          set shouldInclude to false\n';
      script += '        end if\n';
    }
    script += '      end if\n';
  }
  
  script += '      if shouldInclude then\n';
  
  // Build result using NSMutableDictionary
  script += '        set todoDict to current application\'s NSMutableDictionary\'s dictionary()\n';
  script += '        todoDict\'s setObject:(id of t) forKey:"id"\n';
  script += '        todoDict\'s setObject:(name of t) forKey:"title"\n';
  script += '        todoDict\'s setObject:true forKey:"completed"\n';
  script += '        resultArray\'s addObject:todoDict\n';
  script += '        set resultCount to resultCount + 1\n';
  script += '      end if\n';
  
  script += '    end if\n';
  script += '  end repeat\n';
  script += '  \n';
  script += '  -- Convert to JSON\n';
  script += '  set jsonData to current application\'s NSJSONSerialization\'s dataWithJSONObject:resultArray options:0 |error|:(missing value)\n';
  script += '  if jsonData is missing value then\n';
  script += '    return "[]"\n';
  script += '  else\n';
  script += '    set jsonString to current application\'s NSString\'s alloc()\'s initWithData:jsonData encoding:(current application\'s NSUTF8StringEncoding)\n';
  script += '    return jsonString as text\n';
  script += '  end if\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to ensure Things3 is running
 */
export function ensureThings3Running(): string {
  return `
tell application "System Events"
  set isRunning to (count of (every process whose name is "Things3")) > 0
end tell

if not isRunning then
  tell application "Things3"
    activate
    delay 2 -- Wait for Things3 to fully launch
  end tell
end if

return "running"`;
}

/**
 * Generate AppleScript to delete areas
 */
export function deleteAreas(ids: string[]): string {
  let script = 'tell application "Things3"\n';
  script += '  set deletedCount to 0\n';
  
  for (const id of ids) {
    const escapedId = bridge.escapeString(id);
    script += '  try\n';
    script += `    set a to area id "${escapedId}"\n`;
    script += '    delete a\n';
    script += '    set deletedCount to deletedCount + 1\n';
    script += '  end try\n';
  }
  
  script += '  return deletedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to delete projects
 */
export function deleteProjects(ids: string[]): string {
  let script = 'tell application "Things3"\n';
  script += '  set deletedCount to 0\n';
  
  for (const id of ids) {
    const escapedId = bridge.escapeString(id);
    script += '  try\n';
    script += `    set p to project id "${escapedId}"\n`;
    script += '    delete p\n';
    script += '    set deletedCount to deletedCount + 1\n';
    script += '  end try\n';
  }
  
  script += '  return deletedCount\n';
  script += 'end tell';
  
  return script;
}

/**
 * Generate AppleScript to get Things3 version
 */
export function getThings3Version(): string {
  return `
tell application "Things3"
  return version
end tell`;
}