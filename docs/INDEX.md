# SoftOne Agent Platform docs

These docs describe how the **API wrapper** and **MCP server** fit together, so future agents can use the tools correctly.

## Start here

- [SoftOne WS reference](softone_ws_reference.md) (raw JSON services)
- [api wrapper](api/api_wrapper.md) (Python wrapper surface, parameters, examples)
- [mcp overview](mcp/overview.md) (how MCP is structured around the wrapper)
- [mcp tools catalog](mcp/tools_catalog.md) (generated from the live server: every tool + params)
- [playbook customer](agents/playbooks/customer.md) (end-to-end customer workflows for agents)
- [playbook order](agents/playbooks/order.md) (end-to-end order workflows for agents)
- [playbook items](agents/playbooks/items.md) (end-to-end item workflows for agents)
- [playbook payments](agents/playbooks/payments.md) (end-to-end payment workflows for agents)
- [playbook invoices](agents/playbooks/invoices.md) (end-to-end invoice workflows for agents)
- [order to cash](agents/workflows/order_to_cash.md) (end-to-end workflow: customer -> order -> invoice -> payment)
- [ADR 0001: order files skip the model](adr/0001-order-files-skip-the-model.md) (why code, not the agent, turns an order file into a write)

## Where mock mode lives

- **Reads** (list/search SQL, sort order, limits): `softone_wrapper/infrastructure/mock_gateway.py`. The MCP tool → `softone_mcp/business` → `softone_mcp/internal` → `softone_wrapper/client.py` chain only passes arguments through.
- **Writes** and the WS services: `mock_db/ws/objects/` and `mock_db/ws/services/`.
- **Seed data**: `mock_db/create_and_seed.py` (original rows, then the bulk demo rows).

## Key conventions

- **SoftOne terms**: `OBJECT`, `KEY`, `data`, `LOCATEINFO` (match SoftOne WS)
- **MCP tool envelope**:
  - Success: `{ "ok": true, "data": <softone_response> }`
  - Error: `{ "ok": false, "error": { "code": int, "message": str, "details": {...} } }`

