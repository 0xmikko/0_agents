# Plan protocol

The process has one lifecycle and one plan contract:

- [Development process](development-process.md): approvals, execution,
  verification and completion.
- [Plan format](plan-format.md): SPEC, Deliveries, Stages, Tasks and locks.
- [Package contract](../package-contract.md): project agent:* commands.

Only when the owner explicitly selects this workflow, use /blueprint,
/blueprint-start and /end-work through planctl MCP. Never propose or start it
automatically. Ordinary interactive work needs no plan or mode-selection question.
Read the available tool schemas for arguments. This page keeps the existing
entrypoint; it does not define another command sequence or approval process.
