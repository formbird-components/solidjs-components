# `<solid-quote-compare>`

A purchase request's supplier quotes side by side, with what the request's amount needs. It reads the
quotes (separate documents pointing at the request through `requestRel`) and checks them with
`quoteProblems` from proc-kit, the function the server rules use.

- **A card per quote**, cheapest first: the supplier (flagged when it is not an approved supplier),
  the amount ex GST, how much more than the cheapest (+$650, 4%), the lead time, valid until (an
  expired quote is dimmed and doesn't count), its reference and the quote document.
- **What the amount needs**: "3 written quotes are needed for $18,900. 2 valid quotes so far.", with
  a dot per quote needed (the rules: 1 quote from $2,000, 3 from $10,000, as the definition gives).
- **What is still wrong**: too few quotes without a reason there is only one supplier, no quote
  chosen, a chosen quote that isn't the cheapest without a reason, a chosen quote that has expired, or
  lines that don't match the chosen quote.
- **Choose** writes the quote to `chosenField` (`{ documentId, name, supplier, amount }`) and its
  supplier to `supplierField`.
- **Add a quote**: supplier, amount ex GST, valid until, lead time and notes, saved as a new quote
  document for this request (`templateId`). A request that has never been saved says so first.

It writes how many quotes are valid to `countField`, so the client rule can refuse to submit a request
without enough quotes. The server checks the quotes again. It stores nothing in its own field
(definitions set `disableSave: true`).

| Option | Default | |
|---|---|---|
| `templateId` | none | Template of new quotes. Without it there is no Add a quote. |
| `rules` | `[]` | How many quotes an amount needs: `[{ fromAmount, quotes }]`, ex GST. |
| `linesField`, `refField` | `lineItemsArr`, `requestRef` | The request's lines (its amount is their subtotal) and reference. Read once. |
| `chosenField`, `supplierField` | `chosenQuoteRel`, `supplierRel` | Where choosing writes the quote and its supplier. |
| `countField` | none | Where to write how many quotes are valid. |
| `soleSupplierField`, `notCheapestField` | `soleSupplierReason`, `notCheapestReason` | The reasons the rules accept: only read, to say what is still needed. |
| `filter` | the app's quotes for this request | Elasticsearch request for the quotes. |
| `suppliers` | none | Elasticsearch request for the suppliers in the add form. |
| `supplierFields` | `{ approvedBool }` | What a supplier value keeps besides documentId and name. |
| `app`, `taxRate`, `currency` | `"proc"`, `0.1`, `AUD` | |
| `hideLabel` | `false` | |

It searches again after any save in the app (`document:updated`).
