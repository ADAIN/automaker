/**
 * XML Template Format Specification for app_spec.txt
 *
 * This format must be included in all prompts that generate, modify, or regenerate
 * app specifications to ensure consistency across the application.
 */
export const APP_SPEC_XML_FORMAT = `
The app_spec.txt file MUST follow this exact XML format:

<project_specification>
  <project_name>Project Name</project_name>

  <overview>
    A comprehensive description of what the project does, its purpose, and key goals.
  </overview>

  <technology_stack>
    <technology>Technology 1</technology>
    <technology>Technology 2</technology>
    <!-- List all technologies, frameworks, libraries, and tools used -->
  </technology_stack>

  <core_capabilities>
    <capability>Core capability 1</capability>
    <capability>Core capability 2</capability>
    <!-- List main features and capabilities the project provides -->
  </core_capabilities>

  <implemented_features>
    <!-- Features that have been implemented (populated by AI agent based on code analysis) -->
  </implemented_features>

  <!-- Optional sections that may be included: -->
  <additional_requirements>
    <!-- Any additional requirements or constraints -->
  </additional_requirements>

  <development_guidelines>
    <guideline>Guideline 1</guideline>
    <guideline>Guideline 2</guideline>
    <!-- Development standards and practices -->
  </development_guidelines>

  <implementation_roadmap>
    <!-- Phases or roadmap items for implementation -->
  </implementation_roadmap>
</project_specification>

IMPORTANT: 
- All content must be wrapped in valid XML tags
- Use proper XML escaping for special characters (&lt;, &gt;, &amp;)
- Maintain proper indentation (2 spaces)
- All sections should be populated based on project analysis
- The format must be strictly followed - do not use markdown, JSON, or any other format
`;

/**
 * Returns a prompt suffix that instructs the AI to format the response as XML
 * following the app_spec.txt template format.
 */
export function getAppSpecFormatInstruction(): string {
  return `
${APP_SPEC_XML_FORMAT}

CRITICAL FORMATTING REQUIREMENTS:
- Your ENTIRE response MUST be valid XML following the exact template structure above
- Do NOT use markdown formatting (no # headers, no **bold**, no - lists, etc.)
- Do NOT include any explanatory text, prefix, or suffix outside the XML tags
- Do NOT include phrases like "Based on my analysis..." or "I'll create..." before the XML
- Do NOT include any text before <project_specification> or after </project_specification>
- Your response must start IMMEDIATELY with <project_specification> with no preceding text
- Your response must end IMMEDIATELY with </project_specification> with no following text
- Use ONLY XML tags as shown in the template
- Properly escape XML special characters (&lt; for <, &gt; for >, &amp; for &)
- Maintain 2-space indentation for readability
- The output will be saved directly to app_spec.txt and must be parseable as valid XML
- The response must contain exactly ONE root XML element: <project_specification>
- Do not include code blocks, markdown fences, or any other formatting

VERIFICATION: Before responding, verify that:
1. Your response starts with <project_specification> (no spaces, no text before it)
2. Your response ends with </project_specification> (no spaces, no text after it)
3. There is exactly one root XML element
4. There is no explanatory text, analysis, or commentary outside the XML tags

Your response should be ONLY the XML content, nothing else.
`;
}
