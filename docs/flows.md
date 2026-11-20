# Power Automate — the 9 cloud flows

| # | Flow | Trigger | Process |
|---|---|---|---|
| 1 | Staffing request: Form → List | Automated (new Forms response) | RP |
| 2 | Request status tracking | Automated (item created or modified) | RP |
| 3 | Daily SLA update | Scheduled (recurrence) | RP |
| 4 | Headcount increase: send request to manager | Automated (item created) | RP |
| 5 | Generate staffing request PDF | Instant (manual, from the list) | RP |
| 6 | Interview schedule notice | Automated (item created) | RP |
| 7 | Personnel change: Form → Excel and List | Automated (new Forms response) | MP |
| 8 | Personnel change: status notice to manager | Automated (item created or modified) | MP |
| 9 | Generate personnel change PDF | Instant (manual, from the list) | MP |

---

### 1. Staffing request: Form → List
1. **When a new response is submitted** (Forms)
2. **Get response details**
3. **Create item** in *Staffing Requests*, mapping each answer to a column
4. **Update item**: sets the request number and initial status (*Received*)
5. **Condition** on the response, then **Parse JSON** for multi-value answers
6. **Send an e-mail (V2)**: confirmation to the manager and to HR

### 2. Request status tracking
1. **When an item is created or modified** (*Staffing Requests*)
2. **Get changes for an item or a file (properties only)**: checks whether *Status* really changed since the last run
3. **Conditions** on the new status → **Update item**: stamps the matching date (selection date, hiring date, frozen since)

Using *Get changes* instead of reacting to every edit keeps the flow from looping on its own updates.

### 3. Daily SLA update
1. **Recurrence**: runs once a day
2. **Get items**: open requests in *Staffing Requests*
3. **Apply to each** → **Condition** (closed or still open?) → **Update item**
   - recalculates *Days open* and *Days frozen*
   - sets *SLA status* by comparing *Days open* with *SLA target*

### 4. Headcount increase: send request to manager
1. **When an item is created** (*Staffing Requests*)
2. **Get item**
3. **Create file**: builds an HTML document from the item fields
4. **Convert file** (HTML → PDF)
5. **Add attachment**: the PDF is attached to the list item
6. **Send an e-mail (V2)** to the manager with the PDF
7. **Delete file**: removes the temporary HTML/PDF

### 5. Generate staffing request PDF
Same pipeline as flow 4 (**Get item → Create file → Convert file → Add attachment → Send e-mail → Delete file**), started manually by HR from the selected list item.

### 6. Interview schedule notice
1. **When an item is created** (*Interview Schedule*)
2. **Get item**: reads the step, date/time and the linked request
3. **Send an e-mail (V2)**: notifies the people involved

### 7. Personnel change: Form → Excel and List
1. **When a new response is submitted** (Forms)
2. **Get response details**
3. **Add a row into a table** (Excel): keeps a raw log of every response
4. **Send an HTTP request to SharePoint**: creates the item in *Personnel Changes* through the REST API, which allows full control over the payload and field types
5. **Send an e-mail (V2)**: confirmation

### 8. Personnel change: status notice to manager
1. **When an item is created or modified** (*Personnel Changes*)
2. **Send an e-mail (V2)**: tells the manager the new status (*Under review / Approved / Cancelled*)
3. **Send an HTTP request to SharePoint**: writes the status that was just e-mailed into *Notified status*, so the same status is never e-mailed twice

### 9. Generate personnel change PDF
**Manual trigger → Get item → Create file → Convert file → Add attachment → Delete file**: produces the formal change document and attaches it to the item.
