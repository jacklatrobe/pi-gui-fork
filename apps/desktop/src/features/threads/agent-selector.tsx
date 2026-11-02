import { useEffect, useRef, useState } from "react";
import type { AgentIdentityRecord } from "../../../contracts/agents";

/** The badge text, shared by the picker and the read-only thread badge. */
export function agentBadgeLabel(name: string | undefined): string {
  return name ? `Agent · ${name}` : "Agent";
}

function useDismissablePopover(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  return containerRef;
}

function agentMeta(agent: AgentIdentityRecord): string {
  const parts: string[] = [agent.source];
  if (agent.model) parts.push(agent.model);
  if (agent.tools && agent.tools.length > 0) parts.push(`tools: ${agent.tools.join(", ")}`);
  return parts.join(" · ");
}

/**
 * Choose the agent identity the thread starts as. The list is the workspace's agent
 * markdown files; `Default` starts pi-gui's ordinary session with no agent prompt.
 */
export function AgentSelector({
  agents,
  value,
  onSelect,
}: {
  readonly agents: readonly AgentIdentityRecord[];
  readonly value: string | undefined;
  readonly onSelect: (name: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useDismissablePopover(open, () => setOpen(false));

  return (
    <span className="model-selector" ref={containerRef}>
      <span className="model-selector__anchor">
        <button
          aria-expanded={open}
          className={`model-selector__badge${value ? " model-selector__badge--set" : ""}`}
          type="button"
          data-testid="agent-identity-badge"
          onClick={() => setOpen(!open)}
        >
          {agentBadgeLabel(value)}
        </button>
        {open ? (
          <div
            className="model-selector__dropdown model-selector__dropdown--below agent-identity__dropdown"
            data-testid="agent-identity-dropdown"
            onWheel={(event) => event.stopPropagation()}
          >
            <div className="model-selector__group-title">Agent identity</div>
            <button
              className={`model-selector__item${value === undefined ? " model-selector__item--active" : ""}`}
              type="button"
              data-testid="agent-identity-option-default"
              onClick={() => {
                onSelect(undefined);
                setOpen(false);
              }}
            >
              <span className="model-selector__item-label">Default</span>
              <span className="model-selector__item-meta">no agent prompt</span>
            </button>
            {agents.map((agent) => (
              <button
                className={`model-selector__item${agent.name === value ? " model-selector__item--active" : ""}`}
                key={agent.name}
                type="button"
                data-testid={`agent-identity-option-${agent.name}`}
                onClick={() => {
                  onSelect(agent.name);
                  setOpen(false);
                }}
              >
                <span className="agent-identity__option">
                  <span className="model-selector__item-label">{agent.name}</span>
                  <span className="model-selector__item-meta">{agentMeta(agent)}</span>
                  {agent.description ? (
                    <span className="agent-identity__description">{agent.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
            {agents.length === 0 ? (
              <div className="model-selector__empty">
                No agents found. Install pi-subagents or add markdown agents under
                ~/.pi/agent/agents or .pi/agents.
              </div>
            ) : null}
          </div>
        ) : null}
      </span>
    </span>
  );
}

/** The identity a running thread started as. Read-only: the prompt is fixed at session start. */
export function AgentBadge({ name }: { readonly name: string | undefined }) {
  if (!name) return null;
  return (
    <span
      className="model-selector__badge agent-identity__badge--readonly"
      data-testid="agent-identity-session-badge"
      title={`This thread started as the ${name} agent.`}
    >
      {agentBadgeLabel(name)}
    </span>
  );
}
