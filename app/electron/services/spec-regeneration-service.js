const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const fs = require("fs/promises");
const path = require("path");
const mcpServerFactory = require("./mcp-server-factory");
const featureLoader = require("./feature-loader");

/**
 * XML template for app_spec.txt
 */
const APP_SPEC_XML_TEMPLATE = `<project_specification>
  <project_name></project_name>

  <overview>
  </overview>

  <technology_stack>
    <frontend>
      <framework></framework>
      <ui_library></ui_library>
      <styling></styling>
      <state_management></state_management>
      <drag_drop></drag_drop>
      <icons></icons>
    </frontend>
    <desktop_shell>
      <framework></framework>
      <language></language>
      <inter_process_communication></inter_process_communication>
      <file_system></file_system>
    </desktop_shell>
    <ai_engine>
      <logic_model></logic_model>
      <design_model></design_model>
      <orchestration></orchestration>
    </ai_engine>
    <testing>
      <framework></framework>
      <unit></unit>
    </testing>
  </technology_stack>

  <core_capabilities>
    <project_management>
    </project_management>

    <intelligent_analysis>
    </intelligent_analysis>

    <kanban_workflow>
    </kanban_workflow>

    <autonomous_agent_engine>
    </autonomous_agent_engine>

    <extensibility>
    </extensibility>
  </core_capabilities>

  <ui_layout>
    <window_structure>
    </window_structure>
    <theme>
    </theme>
  </ui_layout>

  <development_workflow>
    <local_testing>
    </local_testing>
  </development_workflow>

  <implementation_roadmap>
    <phase_1_foundation>
    </phase_1_foundation>
    <phase_2_core_logic>
    </phase_2_core_logic>
    <phase_3_kanban_and_interaction>
    </phase_3_kanban_and_interaction>
    <phase_4_polish>
    </phase_4_polish>
  </implementation_roadmap>
</project_specification>`;

/**
 * Spec Regeneration Service - Regenerates app spec based on project description and tech stack
 */
class SpecRegenerationService {
  constructor() {
    this.runningRegeneration = null;
  }

  /**
   * Create initial app spec for a new project
   * @param {string} projectPath - Path to the project
   * @param {string} projectOverview - User's project description
   * @param {Function} sendToRenderer - Function to send events to renderer
   * @param {Object} execution - Execution context with abort controller
   * @param {boolean} generateFeatures - Whether to generate feature entries in features folder
   */
  async createInitialSpec(projectPath, projectOverview, sendToRenderer, execution, generateFeatures = true) {
    const startTime = Date.now();
    console.log(`[SpecRegeneration] ===== Starting initial spec creation =====`);
    console.log(`[SpecRegeneration] Project path: ${projectPath}`);
    console.log(`[SpecRegeneration] Generate features: ${generateFeatures}`);
    console.log(`[SpecRegeneration] Project overview length: ${projectOverview.length} characters`);

    try {
      const abortController = new AbortController();
      execution.abortController = abortController;

      // Phase tracking
      let currentPhase = "initialization";
      
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `[Phase: ${currentPhase}] Initializing spec generation process...\n`,
      });
      console.log(`[SpecRegeneration] Phase: ${currentPhase}`);

      // Create custom MCP server with UpdateFeatureStatus tool if generating features
      let featureToolsServer = null;
      if (generateFeatures) {
        console.log("[SpecRegeneration] Setting up feature generation tools...");
        try {
          featureToolsServer = mcpServerFactory.createFeatureToolsServer(
            featureLoader.updateFeatureStatus.bind(featureLoader),
            projectPath
          );
          console.log("[SpecRegeneration] Feature tools server created successfully");
        } catch (error) {
          console.error("[SpecRegeneration] ERROR: Failed to create feature tools server:", error);
          sendToRenderer({
            type: "spec_regeneration_error",
            error: `Failed to initialize feature generation tools: ${error.message}`,
          });
          throw error;
        }
      }

      currentPhase = "setup";
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `[Phase: ${currentPhase}] Configuring AI agent and tools...\n`,
      });
      console.log(`[SpecRegeneration] Phase: ${currentPhase}`);

      // Phase 1: Generate spec WITHOUT UpdateFeatureStatus tool
      // This prevents features from being created before the spec is complete
      const options = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: this.getInitialCreationSystemPrompt(false), // Always false - no feature tools during spec gen
        maxTurns: 50,
        cwd: projectPath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"], // No UpdateFeatureStatus during spec gen
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = this.buildInitialCreationPrompt(projectOverview); // No feature generation during spec creation

      currentPhase = "analysis";
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `[Phase: ${currentPhase}] Starting project analysis and spec creation...\n`,
      });
      console.log(`[SpecRegeneration] Phase: ${currentPhase} - Starting AI agent query`);
      
      if (generateFeatures) {
        sendToRenderer({
          type: "spec_regeneration_progress",
          content: `[Phase: ${currentPhase}] Feature generation is enabled - features will be created after spec is complete.\n`,
        });
        console.log("[SpecRegeneration] Feature generation enabled - will create features after spec");
      }

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let fullResponse = "";
      let toolCallCount = 0;
      let messageCount = 0;
      
      try {
        for await (const msg of currentQuery) {
          if (!execution.isActive()) {
            console.log("[SpecRegeneration] Execution aborted by user");
            break;
          }

          if (msg.type === "assistant" && msg.message?.content) {
            messageCount++;
            for (const block of msg.message.content) {
              if (block.type === "text") {
                fullResponse += block.text;
                const preview = block.text.substring(0, 100).replace(/\n/g, " ");
                console.log(`[SpecRegeneration] Agent message #${messageCount}: ${preview}...`);
                sendToRenderer({
                  type: "spec_regeneration_progress",
                  content: block.text,
                });
              } else if (block.type === "tool_use") {
                toolCallCount++;
                const toolName = block.name;
                console.log(`[SpecRegeneration] Tool call #${toolCallCount}: ${toolName}`);
                console.log(`[SpecRegeneration] Tool input: ${JSON.stringify(block.input).substring(0, 200)}...`);
                
                sendToRenderer({
                  type: "spec_regeneration_progress",
                  content: `\n[Tool] Using ${toolName}...\n`,
                });
                
                sendToRenderer({
                  type: "spec_regeneration_tool",
                  tool: toolName,
                  input: block.input,
                });
              }
            }
          } else if (msg.type === "tool_result") {
            const toolName = msg.toolName || "unknown";
            const result = msg.content?.[0]?.text || JSON.stringify(msg.content);
            const resultPreview = result.substring(0, 200).replace(/\n/g, " ");
            console.log(`[SpecRegeneration] Tool result (${toolName}): ${resultPreview}...`);
            
            // During spec generation, UpdateFeatureStatus is not available
            sendToRenderer({
              type: "spec_regeneration_progress",
              content: `[Tool Result] ${toolName} completed successfully\n`,
            });
          } else if (msg.type === "error") {
            const errorMsg = msg.error?.message || JSON.stringify(msg.error);
            console.error(`[SpecRegeneration] ERROR in query stream: ${errorMsg}`);
            sendToRenderer({
              type: "spec_regeneration_error",
              error: `Error during spec generation: ${errorMsg}`,
            });
          }
        }
      } catch (streamError) {
        console.error("[SpecRegeneration] ERROR in query stream:", streamError);
        sendToRenderer({
          type: "spec_regeneration_error",
          error: `Stream error: ${streamError.message || String(streamError)}`,
        });
        throw streamError;
      }
      
      console.log(`[SpecRegeneration] Query completed - ${messageCount} messages, ${toolCallCount} tool calls`);

      execution.query = null;
      execution.abortController = null;

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      currentPhase = "spec_complete";
      console.log(`[SpecRegeneration] Phase: ${currentPhase} - Spec creation completed in ${elapsedTime}s`);
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `\n[Phase: ${currentPhase}] ✓ App specification created successfully! (${elapsedTime}s)\n`,
      });
      
      if (generateFeatures) {
        // Phase 2: Generate features AFTER spec is complete
        console.log(`[SpecRegeneration] Starting Phase 2: Feature generation from app_spec.txt`);
        
        // Send intermediate completion event for spec creation
        sendToRenderer({
          type: "spec_regeneration_complete",
          message: "Initial spec creation complete! Features are being generated...",
        });
        
        // Now start feature generation in a separate query
        try {
          await this.generateFeaturesFromSpec(projectPath, sendToRenderer, execution, startTime);
          console.log(`[SpecRegeneration] Feature generation completed successfully`);
        } catch (featureError) {
          console.error(`[SpecRegeneration] Feature generation failed:`, featureError);
          sendToRenderer({
            type: "spec_regeneration_error",
            error: `Feature generation failed: ${featureError.message || String(featureError)}`,
          });
        }
      } else {
        currentPhase = "complete";
        sendToRenderer({
          type: "spec_regeneration_progress",
          content: `[Phase: ${currentPhase}] All tasks completed!\n`,
        });
        
        // Send final completion event
        sendToRenderer({
          type: "spec_regeneration_complete",
          message: "Initial spec creation complete!",
        });
      }

      console.log(`[SpecRegeneration] ===== Initial spec creation finished successfully =====`);
      return {
        success: true,
        message: "Initial spec creation complete",
      };
    } catch (error) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log(`[SpecRegeneration] Creation aborted after ${elapsedTime}s`);
        sendToRenderer({
          type: "spec_regeneration_error",
          error: "Spec generation was aborted by user",
        });
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          success: false,
          message: "Creation aborted",
        };
      }

      const errorMessage = error.message || String(error);
      const errorStack = error.stack || "";
      console.error(`[SpecRegeneration] ERROR creating initial spec after ${elapsedTime}s:`);
      console.error(`[SpecRegeneration] Error message: ${errorMessage}`);
      console.error(`[SpecRegeneration] Error stack: ${errorStack}`);
      
      sendToRenderer({
        type: "spec_regeneration_error",
        error: `Failed to create spec: ${errorMessage}`,
      });
      
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Generate features from the implementation roadmap in app_spec.txt
   * This is called AFTER the spec has been created
   */
  async generateFeaturesFromSpec(projectPath, sendToRenderer, execution, startTime) {
    const featureStartTime = Date.now();
    let currentPhase = "feature_generation";
    
    console.log(`[SpecRegeneration] ===== Starting Phase 2: Feature Generation =====`);
    console.log(`[SpecRegeneration] Project path: ${projectPath}`);
    
    sendToRenderer({
      type: "spec_regeneration_progress",
      content: `\n[Phase: ${currentPhase}] Starting feature creation from implementation roadmap...\n`,
    });
    console.log(`[SpecRegeneration] Phase: ${currentPhase} - Starting feature generation query`);
    
    try {
      // Create feature tools server
      const featureToolsServer = mcpServerFactory.createFeatureToolsServer(
        featureLoader.updateFeatureStatus.bind(featureLoader),
        projectPath
      );
      
      const abortController = new AbortController();
      execution.abortController = abortController;
      
      const options = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: `You are a feature management assistant. Your job is to read the app_spec.txt file and create feature entries based on the implementation_roadmap section.

**Your Task:**
1. Read the .automaker/app_spec.txt file
2. Parse the implementation_roadmap section (it contains phases with features listed)
3. For each feature listed in the roadmap, use the UpdateFeatureStatus tool to create a feature entry
4. Set the initial status to "todo" for all features
5. Extract a meaningful summary/description for each feature from the roadmap

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Use the UpdateFeatureStatus tool to create features. The tool will handle creating the directory structure and feature.json file.

**Important:**
- Create features ONLY from the implementation_roadmap section
- Use the UpdateFeatureStatus tool for each feature
- Set status to "todo" initially
- Use a descriptive featureId based on the feature name (lowercase, hyphens for spaces)`,
        maxTurns: 50,
        cwd: projectPath,
        mcpServers: {
          "automaker-tools": featureToolsServer,
        },
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "mcp__automaker-tools__UpdateFeatureStatus"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };
      
      const prompt = `Please read the .automaker/app_spec.txt file and create feature entries for all features listed in the implementation_roadmap section.

For each feature in the roadmap:
1. Use the UpdateFeatureStatus tool to create the feature
2. Set status to "todo"
3. Provide a clear summary/description based on what's in the roadmap
4. Use a featureId that's descriptive and follows the pattern: lowercase with hyphens (e.g., "user-authentication", "payment-processing")

Start by reading the app_spec.txt file to see the implementation roadmap.`;
      
      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;
      
      let toolCallCount = 0;
      let messageCount = 0;
      
      try {
        for await (const msg of currentQuery) {
          if (!execution.isActive()) {
            console.log("[SpecRegeneration] Feature generation aborted by user");
            break;
          }
          
          if (msg.type === "assistant" && msg.message?.content) {
            messageCount++;
            for (const block of msg.message.content) {
              if (block.type === "text") {
                const preview = block.text.substring(0, 100).replace(/\n/g, " ");
                console.log(`[SpecRegeneration] Feature gen message #${messageCount}: ${preview}...`);
                sendToRenderer({
                  type: "spec_regeneration_progress",
                  content: block.text,
                });
              } else if (block.type === "tool_use") {
                toolCallCount++;
                const toolName = block.name;
                const toolInput = block.input;
                console.log(`[SpecRegeneration] Feature gen tool call #${toolCallCount}: ${toolName}`);
                
                if (toolName === "mcp__automaker-tools__UpdateFeatureStatus" || toolName === "UpdateFeatureStatus") {
                  const featureId = toolInput?.featureId || "unknown";
                  const status = toolInput?.status || "unknown";
                  const summary = toolInput?.summary || "";
                  sendToRenderer({
                    type: "spec_regeneration_progress",
                    content: `\n[Feature Creation] Creating feature "${featureId}" with status "${status}"${summary ? `\n  Summary: ${summary}` : ""}\n`,
                  });
                } else {
                  sendToRenderer({
                    type: "spec_regeneration_progress",
                    content: `\n[Tool] Using ${toolName}...\n`,
                  });
                }
                
                sendToRenderer({
                  type: "spec_regeneration_tool",
                  tool: toolName,
                  input: toolInput,
                });
              }
            }
          } else if (msg.type === "tool_result") {
            const toolName = msg.toolName || "unknown";
            const result = msg.content?.[0]?.text || JSON.stringify(msg.content);
            const resultPreview = result.substring(0, 200).replace(/\n/g, " ");
            console.log(`[SpecRegeneration] Feature gen tool result (${toolName}): ${resultPreview}...`);
            
            if (toolName === "mcp__automaker-tools__UpdateFeatureStatus" || toolName === "UpdateFeatureStatus") {
              sendToRenderer({
                type: "spec_regeneration_progress",
                content: `[Feature Creation] ${result}\n`,
              });
            } else {
              sendToRenderer({
                type: "spec_regeneration_progress",
                content: `[Tool Result] ${toolName} completed successfully\n`,
              });
            }
          } else if (msg.type === "error") {
            const errorMsg = msg.error?.message || JSON.stringify(msg.error);
            console.error(`[SpecRegeneration] ERROR in feature generation stream: ${errorMsg}`);
            sendToRenderer({
              type: "spec_regeneration_error",
              error: `Error during feature generation: ${errorMsg}`,
            });
          }
        }
      } catch (streamError) {
        console.error("[SpecRegeneration] ERROR in feature generation stream:", streamError);
        sendToRenderer({
          type: "spec_regeneration_error",
          error: `Feature generation stream error: ${streamError.message || String(streamError)}`,
        });
        throw streamError;
      }
      
      console.log(`[SpecRegeneration] Feature generation completed - ${messageCount} messages, ${toolCallCount} tool calls`);
      
      execution.query = null;
      execution.abortController = null;
      
      currentPhase = "complete";
      const featureElapsedTime = ((Date.now() - featureStartTime) / 1000).toFixed(1);
      const totalElapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `\n[Phase: ${currentPhase}] ✓ All tasks completed! (${totalElapsedTime}s total, ${featureElapsedTime}s for features)\n`,
      });
      sendToRenderer({
        type: "spec_regeneration_complete",
        message: "All tasks completed!",
      });
      console.log(`[SpecRegeneration] All tasks completed including feature generation`);
      
    } catch (error) {
      const errorMessage = error.message || String(error);
      console.error(`[SpecRegeneration] ERROR generating features: ${errorMessage}`);
      sendToRenderer({
        type: "spec_regeneration_error",
        error: `Failed to generate features: ${errorMessage}`,
      });
      throw error;
    }
  }

  /**
   * Generate features from existing app_spec.txt
   * This is a standalone method that can be called without generating a new spec
   * Useful for retroactively generating features from an existing spec
   */
  async generateFeaturesOnly(projectPath, sendToRenderer, execution) {
    const startTime = Date.now();
    console.log(`[SpecRegeneration] ===== Starting standalone feature generation =====`);
    console.log(`[SpecRegeneration] Project path: ${projectPath}`);
    
    try {
      // Verify app_spec.txt exists
      const specPath = path.join(projectPath, ".automaker", "app_spec.txt");
      try {
        await fs.access(specPath);
      } catch {
        sendToRenderer({
          type: "spec_regeneration_error",
          error: "No app_spec.txt found. Please create a spec first before generating features.",
        });
        throw new Error("No app_spec.txt found");
      }
      
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `[Phase: initialization] Starting feature generation from existing app_spec.txt...\n`,
      });
      
      // Use the existing feature generation method
      await this.generateFeaturesFromSpec(projectPath, sendToRenderer, execution, startTime);
      
      console.log(`[SpecRegeneration] ===== Standalone feature generation finished successfully =====`);
      return {
        success: true,
        message: "Feature generation complete",
      };
    } catch (error) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const errorMessage = error.message || String(error);
      console.error(`[SpecRegeneration] ERROR in standalone feature generation after ${elapsedTime}s: ${errorMessage}`);
      
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Get the system prompt for initial spec creation
   * @param {boolean} generateFeatures - Whether features should be generated
   */
  getInitialCreationSystemPrompt(generateFeatures = true) {
    return `You are an expert software architect and product manager. Your job is to analyze an existing codebase and generate a comprehensive application specification based on a user's project overview.

You should:
1. First, thoroughly analyze the project structure to understand the existing tech stack
2. Read key configuration files (package.json, tsconfig.json, Cargo.toml, requirements.txt, etc.) to understand dependencies and frameworks
3. Understand the current architecture and patterns used
4. Based on the user's project overview, create a comprehensive app specification
5. Be liberal and comprehensive when defining features - include everything needed for a complete, polished application
6. Use the XML template format provided
7. Write the specification to .automaker/app_spec.txt

When analyzing, look at:
- package.json, cargo.toml, requirements.txt or similar config files for tech stack
- Source code structure and organization
- Framework-specific patterns (Next.js, React, Django, etc.)
- Database configurations and schemas
- API structures and patterns

You CAN and SHOULD modify:
- .automaker/app_spec.txt (this is your primary target)

You have access to file reading, writing, and search tools. Use them to understand the codebase and write the new spec.

**IMPORTANT:** Focus ONLY on creating the app_spec.txt file. Do NOT create any feature files or use any feature management tools during this phase.`;
  }

  /**
   * Build the prompt for initial spec creation
   * @param {string} projectOverview - User's project description
   * @param {boolean} generateFeatures - Whether to generate feature entries in features folder
   */
  buildInitialCreationPrompt(projectOverview, generateFeatures = true) {
    return `I need you to create an initial application specification for my project. I haven't set up an app_spec.txt yet, so this will be the first one.

**My Project Overview:**
${projectOverview}

**Your Task:**

1. First, explore the project to understand the existing tech stack:
   - Read package.json, Cargo.toml, requirements.txt, or similar config files
   - Identify all frameworks and libraries being used
   - Understand the current project structure and architecture
   - Note any database, authentication, or other infrastructure in use

2. Based on my project overview and the existing tech stack, create a comprehensive app specification using this XML template:

\`\`\`xml
${APP_SPEC_XML_TEMPLATE}
\`\`\`

3. Fill out the template with:
   - **project_name**: Extract from the project or derive from overview
   - **overview**: A clear description based on my project overview
   - **technology_stack**: All technologies you discover in the project (fill out the relevant sections, remove irrelevant ones)
   - **core_capabilities**: List all the major capabilities the app should have based on my overview
   - **ui_layout**: Describe the UI structure if relevant
   - **development_workflow**: Note any testing or development patterns
   - **implementation_roadmap**: Break down the features into phases - be VERY detailed here, listing every feature that needs to be built

4. **IMPORTANT**: Write the complete specification to the file \`.automaker/app_spec.txt\`

**Guidelines:**
- Be comprehensive! Include ALL features needed for a complete application
- Only include technology_stack sections that are relevant (e.g., skip desktop_shell if it's a web-only app)
- Add new sections to core_capabilities as needed for the specific project
- The implementation_roadmap should reflect logical phases for building out the app - list EVERY feature individually
- Consider user flows, error states, and edge cases when defining features
- Each phase should have multiple specific, actionable features

Begin by exploring the project structure.`;
  }

  /**
   * Regenerate the app spec based on user's project definition
   */
  async regenerateSpec(projectPath, projectDefinition, sendToRenderer, execution) {
    const startTime = Date.now();
    console.log(`[SpecRegeneration] ===== Starting spec regeneration =====`);
    console.log(`[SpecRegeneration] Project path: ${projectPath}`);
    console.log(`[SpecRegeneration] Project definition length: ${projectDefinition.length} characters`);

    try {
      let currentPhase = "initialization";
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `[Phase: ${currentPhase}] Initializing spec regeneration process...\n`,
      });
      console.log(`[SpecRegeneration] Phase: ${currentPhase}`);

      const abortController = new AbortController();
      execution.abortController = abortController;

      currentPhase = "setup";
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `[Phase: ${currentPhase}] Configuring AI agent and tools...\n`,
      });
      console.log(`[SpecRegeneration] Phase: ${currentPhase}`);

      const options = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: this.getSystemPrompt(),
        maxTurns: 50,
        cwd: projectPath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = this.buildRegenerationPrompt(projectDefinition);

      currentPhase = "regeneration";
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `[Phase: ${currentPhase}] Starting spec regeneration...\n`,
      });
      console.log(`[SpecRegeneration] Phase: ${currentPhase} - Starting AI agent query`);

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let fullResponse = "";
      let toolCallCount = 0;
      let messageCount = 0;
      
      try {
        for await (const msg of currentQuery) {
          if (!execution.isActive()) {
            console.log("[SpecRegeneration] Execution aborted by user");
            break;
          }

          if (msg.type === "assistant" && msg.message?.content) {
            messageCount++;
            for (const block of msg.message.content) {
              if (block.type === "text") {
                fullResponse += block.text;
                const preview = block.text.substring(0, 100).replace(/\n/g, " ");
                console.log(`[SpecRegeneration] Agent message #${messageCount}: ${preview}...`);
                sendToRenderer({
                  type: "spec_regeneration_progress",
                  content: `[Agent] ${block.text}`,
                });
              } else if (block.type === "tool_use") {
                toolCallCount++;
                const toolName = block.name;
                const toolInput = block.input;
                console.log(`[SpecRegeneration] Tool call #${toolCallCount}: ${toolName}`);
                console.log(`[SpecRegeneration] Tool input: ${JSON.stringify(toolInput).substring(0, 200)}...`);
                
                // Special handling for UpdateFeatureStatus to show feature creation
                if (toolName === "mcp__automaker-tools__UpdateFeatureStatus" || toolName === "UpdateFeatureStatus") {
                  const featureId = toolInput?.featureId || "unknown";
                  const status = toolInput?.status || "unknown";
                  const summary = toolInput?.summary || "";
                  sendToRenderer({
                    type: "spec_regeneration_progress",
                    content: `\n[Feature Creation] Creating feature "${featureId}" with status "${status}"${summary ? `\n  Summary: ${summary}` : ""}\n`,
                  });
                } else {
                  sendToRenderer({
                    type: "spec_regeneration_progress",
                    content: `\n[Tool] Using ${toolName}...\n`,
                  });
                }
                
                sendToRenderer({
                  type: "spec_regeneration_tool",
                  tool: toolName,
                  input: toolInput,
                });
              }
            }
          } else if (msg.type === "tool_result") {
            // Log tool results for better visibility
            const toolName = msg.toolName || "unknown";
            const result = msg.content?.[0]?.text || JSON.stringify(msg.content);
            const resultPreview = result.substring(0, 200).replace(/\n/g, " ");
            console.log(`[SpecRegeneration] Tool result (${toolName}): ${resultPreview}...`);
            
            // Special handling for UpdateFeatureStatus results
            if (toolName === "mcp__automaker-tools__UpdateFeatureStatus" || toolName === "UpdateFeatureStatus") {
              sendToRenderer({
                type: "spec_regeneration_progress",
                content: `[Feature Creation] ${result}\n`,
              });
            } else {
              sendToRenderer({
                type: "spec_regeneration_progress",
                content: `[Tool Result] ${toolName} completed successfully\n`,
              });
            }
          } else if (msg.type === "error") {
            const errorMsg = msg.error?.message || JSON.stringify(msg.error);
            console.error(`[SpecRegeneration] ERROR in query stream: ${errorMsg}`);
            sendToRenderer({
              type: "spec_regeneration_error",
              error: `Error during spec regeneration: ${errorMsg}`,
            });
          }
        }
      } catch (streamError) {
        console.error("[SpecRegeneration] ERROR in query stream:", streamError);
        sendToRenderer({
          type: "spec_regeneration_error",
          error: `Stream error: ${streamError.message || String(streamError)}`,
        });
        throw streamError;
      }
      
      console.log(`[SpecRegeneration] Query completed - ${messageCount} messages, ${toolCallCount} tool calls`);

      execution.query = null;
      execution.abortController = null;

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      currentPhase = "complete";
      console.log(`[SpecRegeneration] Phase: ${currentPhase} - Spec regeneration completed in ${elapsedTime}s`);
      sendToRenderer({
        type: "spec_regeneration_progress",
        content: `\n[Phase: ${currentPhase}] ✓ Spec regeneration complete! (${elapsedTime}s)\n`,
      });

      sendToRenderer({
        type: "spec_regeneration_complete",
        message: "Spec regeneration complete!",
      });

      console.log(`[SpecRegeneration] ===== Spec regeneration finished successfully =====`);
      return {
        success: true,
        message: "Spec regeneration complete",
      };
    } catch (error) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log(`[SpecRegeneration] Regeneration aborted after ${elapsedTime}s`);
        sendToRenderer({
          type: "spec_regeneration_error",
          error: "Spec regeneration was aborted by user",
        });
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          success: false,
          message: "Regeneration aborted",
        };
      }

      const errorMessage = error.message || String(error);
      const errorStack = error.stack || "";
      console.error(`[SpecRegeneration] ERROR regenerating spec after ${elapsedTime}s:`);
      console.error(`[SpecRegeneration] Error message: ${errorMessage}`);
      console.error(`[SpecRegeneration] Error stack: ${errorStack}`);
      
      sendToRenderer({
        type: "spec_regeneration_error",
        error: `Failed to regenerate spec: ${errorMessage}`,
      });
      
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Get the system prompt for spec regeneration
   */
  getSystemPrompt() {
    return `You are an expert software architect and product manager. Your job is to analyze an existing codebase and generate a comprehensive application specification based on a user's project definition.

You should:
1. First, thoroughly analyze the project structure to understand the existing tech stack
2. Read key configuration files (package.json, tsconfig.json, etc.) to understand dependencies and frameworks
3. Understand the current architecture and patterns used
4. Based on the user's project definition, create a comprehensive app specification that includes ALL features needed to realize their vision
5. Be liberal and comprehensive when defining features - include everything needed for a complete, polished application
6. Write the specification to .automaker/app_spec.txt

When analyzing, look at:
- package.json, cargo.toml, or similar config files for tech stack
- Source code structure and organization
- Framework-specific patterns (Next.js, React, etc.)
- Database configurations and schemas
- API structures and patterns

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Do NOT manually create feature files. Use the UpdateFeatureStatus tool to manage features.

You CAN and SHOULD modify:
- .automaker/app_spec.txt (this is your primary target)

You have access to file reading, writing, and search tools. Use them to understand the codebase and write the new spec.`;
  }

  /**
   * Build the prompt for regenerating the spec
   */
  buildRegenerationPrompt(projectDefinition) {
    return `I need you to regenerate my application specification based on the following project definition. Be very comprehensive and liberal when defining features - I want a complete, polished application.

**My Project Definition:**
${projectDefinition}

**Your Task:**

1. First, explore the project to understand the existing tech stack:
   - Read package.json or similar config files
   - Identify all frameworks and libraries being used
   - Understand the current project structure and architecture
   - Note any database, authentication, or other infrastructure in use

2. Based on my project definition and the existing tech stack, create a comprehensive app specification that includes:
   - Product Overview: A clear description of what the app does
   - Tech Stack: All technologies currently in use
   - Features: A COMPREHENSIVE list of all features needed to realize my vision
     - Be liberal! Include all features that would make this a complete, production-ready application
     - Include core features, supporting features, and nice-to-have features
     - Think about user experience, error handling, edge cases, etc.
   - Architecture Notes: Any important architectural decisions or patterns

3. **IMPORTANT**: Write the complete specification to the file \`.automaker/app_spec.txt\`

**Format Guidelines for the Spec:**

Use this general structure:

\`\`\`
# [App Name] - Application Specification

## Product Overview
[Description of what the app does and its purpose]

## Tech Stack
- Frontend: [frameworks, libraries]
- Backend: [frameworks, APIs]
- Database: [if applicable]
- Other: [other relevant tech]

## Features

### [Category 1]
- **[Feature Name]**: [Detailed description of the feature]
- **[Feature Name]**: [Detailed description]
...

### [Category 2]
- **[Feature Name]**: [Detailed description]
...

## Architecture Notes
[Any important architectural notes, patterns, or conventions]
\`\`\`

**Remember:**
- Be comprehensive! Include ALL features needed for a complete application
- Consider user flows, error states, loading states, etc.
- Include authentication, authorization if relevant
- Think about what would make this a polished, production-ready app
- The more detailed and complete the spec, the better

Begin by exploring the project structure.`;
  }

  /**
   * Stop the current regeneration
   */
  stop() {
    if (this.runningRegeneration && this.runningRegeneration.abortController) {
      this.runningRegeneration.abortController.abort();
    }
    this.runningRegeneration = null;
  }
}

module.exports = new SpecRegenerationService();
