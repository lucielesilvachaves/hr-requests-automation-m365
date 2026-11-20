# SharePoint Lists — schema

Three custom lists hold all the data. Column names are translated to English. Choice values are listed in workflow order.

## 1. Staffing Requests (`Controle de Vagas`)

One item per position HR is asked to open.

| Column | Type | Notes |
|---|---|---|
| Title | Single line of text | |
| Request No. | Number | Sequential request number |
| Position | Single line of text | |
| Department | Single line of text | |
| Requesting manager | Single line of text | |
| Manager e-mail | Single line of text | Used for notifications |
| CC e-mails (manager / coordinator) | Single line of text | Extra recipients |
| Work hours | Single line of text | |
| Shift pattern | Single line of text | e.g. 12x36, 5x2 |
| Salary | Currency | |
| Opening reason | Choice | Termination / Promotion / Headcount increase |
| Replaced employee | Single line of text | When the reason is a replacement |
| Termination completed | Choice | Yes / No |
| Internal promotion process | Choice | Yes / No |
| Posting type | Choice | Internal / External / Both |
| **Status** | Choice | Received / Frozen / Under review / In selection / In hiring / Closed / Cancelled |
| Selection date | Date | Filled when status reaches *In selection* |
| Hiring date | Date | Filled when status reaches *In hiring* |
| Hired employee | Single line of text | |
| Frozen since | Date | |
| Days frozen | Number | Updated by the daily SLA flow |
| Days open | Number | Updated by the daily SLA flow |
| SLA target (days) | Number | |
| **SLA status** | Choice | On time / Late / Closed on time / Closed late / Frozen |
| Notes | Single line of text | |

## 2. Personnel Changes (`Controle de Movimentações`)

One item per change request.

| Column | Type | Notes |
|---|---|---|
| Request | Single line of text | Request code |
| Form response ID | Number | Links back to the Forms response |
| Submission date | Date | |
| Requesting manager | Single line of text | |
| Manager e-mail | Single line of text | |
| Change type | Choice | Promotion with replacement / Promotion without replacement / Transfer with replacement (department and/or hours only) / Transfer without replacement (department and/or hours only) / Other |
| Effective from | Date | |
| Employee name | Single line of text | |
| Employee ID | Single line of text | |
| Current position / Current department / Current hours / Current salary | Single line of text | "From" side of the change |
| New position / New department / New hours / New salary | Single line of text | "To" side of the change |
| Notes | Multiple lines of text | |
| Linked to another employee's exit | Choice | Yes / No |
| Replaced employee / Replaced employee ID / Replaced employee hours | Single line of text | |
| Exit reason | Choice | Resignation / Dismissal / End of contract / Leave of absence / Internal promotion or transfer / Other |
| Exit / leave date | Date | |
| **Status** | Choice | Under review / Approved / Cancelled |
| Notified status (flow use) | Single line of text | Technical column: the last status already e-mailed, which prevents duplicate notices |

## 3. Interview Schedule (`Agenda de Processos Seletivos`)

| Column | Type | Notes |
|---|---|---|
| Title | Single line of text | Candidate or step label |
| Selection step | Choice | Screening / HR interview / Manager interview / Group selection / Technical assessment / Other |
| Date and time | Date and time | |
| Notes | Multiple lines of text | |
| HR owner | Person | |
| Request | Lookup | → *Staffing Requests* |
