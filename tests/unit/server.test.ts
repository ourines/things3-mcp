// ABOUTME: Unit tests for the Things3 MCP server
// ABOUTME: Tests server initialization and basic functionality

import { Things3Server } from '../../src/server';

describe('Things3Server', () => {
  let server: Things3Server;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    server = new Things3Server();
  });

  afterEach(async () => {
    await server.stop();
    consoleErrorSpy.mockRestore();
  });

  it('should create a server instance', () => {
    expect(server).toBeInstanceOf(Things3Server);
  });

  it('should start without errors', async () => {
    await expect(server.start()).resolves.not.toThrow();
  });

  it('should stop without errors', async () => {
    await server.start();
    await expect(server.stop()).resolves.not.toThrow();
  });
  
  it('should register all 26 tools via registry pattern', () => {
    // The logger should have logged the registration messages
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Registering Things3 tools...'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Registered 26 tools via registry'));
  });
});