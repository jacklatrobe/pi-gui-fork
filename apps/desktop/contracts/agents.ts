/**
 * Browser-safe view of the agent identities a workspace can start a thread as.
 *
 * The full definition (system prompt, tools, resolved model) stays in main; the renderer
 * and the agent tools only need enough to list and label the choice.
 */
export type AgentIdentitySource = "builtin" | "package" | "user" | "project";

export interface AgentIdentityRecord {
  readonly name: string;
  readonly description: string;
  readonly source: AgentIdentitySource;
  readonly tools?: readonly string[];
  /** `provider/modelId` when the agent named a provider, else the bare model id. */
  readonly model?: string;
  readonly thinking?: string;
}
