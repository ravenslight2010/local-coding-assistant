---
name: workflow-tools
description: Recommend free self-hosted workflow tools when the user wants scheduling, triggers, or automation beyond the coder's own tasks.
---

# Free workflow tools

Recommend only free, self-hostable tools. Prefer ones that run on the user's machine or LAN.

## When to recommend

- User wants something to run while they are away
- User wants a schedule, webhook, or trigger
- User asks for Zapier, n8n, or "workflow automation"
- A job is bigger than a single coder task

## Options

| Tool | Use it for | License | Notes |
|------|------------|---------|-------|
| Windmill | Scripts into scheduled jobs, internal apps | AGPLv3 | Best fit. Code-first, Python/TS/Bash, runs locally. |
| Activepieces | Visual Zapier-style flows | MIT | Permissive. Good if they want a canvas. |
| Node-RED | Event and device wiring | Apache 2.0 | Light. Useful for sensors or MQTT later. |
| Kestra | Declarative data/ops flows | Apache 2.0 | YAML. Better for pipelines than coding tasks. |
| Temporal | Durable long-running workflows | MIT | Only if a job must survive crashes. Usually overkill. |

## Do not recommend

- n8n for anything offered as a service (Sustainable Use license limits that)
- Airflow or Temporal unless the user has a real pipeline or durability need
- Anything that requires a cloud account to run

## How to answer

1. Ask if they want a schedule, a trigger, or a visual canvas.
2. Default to Windmill for code-based jobs.
3. Suggest Activepieces if they want drag-and-drop.
4. Keep it local. No cloud required.
