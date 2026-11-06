# Order files are turned into writes by code, not by the agent

An order file (a client's CSV or Excel order) is parsed, matched against items and stock, and proposed as a pending write by the web server. The operator fixes open rows with controls in the card, and Approve runs the exact stored `workflow_create_order` call once. The model never copies the lines and is not in the path that writes them.

We chose this over letting the agent place the order because two parts of the current code would let the numbers drift. Tools reach the model only through the MCP server process, so the model would have to retype every line from the file into the tool call, and the local 7B model miscopies numbers. Also, Approve replays "yes" through the model, which sends the arguments again, and the gate approves by tool name rather than by exact arguments, so the call that runs could differ from the card the operator approved.

## Considered options

- **Agent places the order, gate tightened to exact arguments.** Safe against drift, but a miscopied line still costs a blocked retry, and the operator would be fixing the model's copying instead of the client's file.
- **Local file tools in both runtimes** (`resolve_row`, `propose_from_file`). Two runtimes to wire and test, and the model still decides when to call them.

## Consequences

- Open rows are fixed in the card, not by typing row numbers in chat.
- The order file path bypasses the router and the department agents, so a change to sales-agent rules doesn't reach it.
- If the gate later approves exact arguments, this decision can be revisited.
