# Glossary

**Operator**
A person who works in SoftOne day to day and uses the agent workspace to read and change ERP data. The primary user of the web UI.
_Avoid_: user (too broad), reviewer (a secondary audience who only skims).

**Turn**
One message from the operator and the agent's complete reply to it, including every tool call the agent made.

**Chat**
One conversation between the operator and the agent on one runtime, made of turns. Starting a new chat, switching runtime or resetting the demo data ends it.
_Avoid_: session (that's the SoftOne login), thread.

**Pending write**
A write the agent tried to make that is waiting at the write gate for the operator's approval. Nothing is written until the operator approves.
_Avoid_: draft, queued change.

**Approve / Reject**
The operator's answer to the pending writes of the last turn. Approve lets the agent run them; Reject drops them without asking the agent anything. A typed reply such as "no, make it 3" is a new message to the agent, not a Reject.
_Avoid_: confirm, deny.

**Turn changes**
The rows a turn inserted, updated or deleted in the database, shown once the turn finishes.
_Avoid_: live changes (nothing is shown mid-turn).

**Order file**
A CSV or Excel file from a client listing the items and quantities for one order for one customer. The operator attaches it to a chat, and it becomes one pending write.
_Avoid_: import, upload, intake, attachment (that's the file a mail carries, before it reaches the chat).

**Open row**
A row of an order file that can't go on the order yet: no item matches, several items match, or there isn't enough stock. The operator resolves it or skips it; nothing is proposed while any row is open.
_Avoid_: error row, invalid line.

**Cancel (an order)**
Withdrawing a Draft order before it is confirmed. A cancelled order is removed entirely; there is no "cancelled" state, and a Confirmed order can't be cancelled.
_Avoid_: cancelled status, void.
