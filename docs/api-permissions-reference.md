# API permissions reference

This document lists the **permissions** required to access each API. Permissions are enforced by `requirePermission(resource, action)` middleware.

## Permission model

- **Actions:** `view` (read-only), `edit` (view + create + update + delete), `none` (no access).
- **Resources:** One permission per resource; `edit` implies `view` for that resource.

---

## Resources and protected APIs

| Resource    | Action  | APIs / modules protected |
|------------|---------|--------------------------|
| **academic** | view  | GET academic (batches, courses, subjects, etc.) |
| **academic** | edit  | POST/PUT/DELETE academic |
| **students** | view  | GET students, student by id |
| **students** | edit  | POST/PUT/DELETE students |
| **staff**    | view  | GET teachers/staff, attendance, payroll (read) |
| **staff**    | edit  | POST/PUT/DELETE teachers, attendance, payroll |
| **attendance** | view | GET attendance-related (e.g. teacher attendance) |
| **attendance** | edit | POST/PUT/DELETE attendance |
| **fees**      | view | GET fee/saved-invoice configuration |
| **fees**      | edit | POST/PUT/DELETE fee configuration, saved invoice contents |
| **invoice**   | view | GET invoices |
| **invoice**   | edit | POST/PUT/DELETE invoices |
| **payments**  | view | GET payments |
| **payments**  | edit | POST/PUT/DELETE payments |
| **payroll**  | view | GET payrolls |
| **payroll**  | edit | POST/PUT/DELETE payrolls |
| **finance**   | view | GET finance (categories, income, expense, accounts, ledgers, summary), analytics |
| **finance**   | edit | POST/PUT/DELETE finance, analytics |
| **settings**  | view | GET colleges, college by id, college attendance criteria |
| **settings**  | edit | POST/PUT/DELETE colleges, college attendance criteria; **upload** (all upload routes require `settings` + `edit`) |
| **team**      | view | GET users list, user by id |
| **team**      | edit | POST/PUT/DELETE users |

---

## Route summary (permission required)

### Auth (`/auth`)
- **Login, register:** no permission (public).
- **GET /auth/me:** authenticated only; no specific permission.

### Roles (`/roles`)
- **All role CRUD:** authenticated only; no `requirePermission` (any logged-in user can list/create/update/delete roles).

### Users / Team (`/users`)
- **GET /users:** `team` **view**
- **GET /users/:id:** `team` **view**
- **POST /users:** `team` **edit**
- **PUT /users/:id:** `team` **edit**
- **DELETE /users/:id:** `team` **edit**

### Students (`/students`)
- **GET /students:** `students` **view**
- **GET /students/:id:** `students` **view**
- **POST /students:** `students` **edit**
- **PUT /students/:id:** `students` **edit**
- **DELETE /students/:id:** `students` **edit**

### Teachers / Staff (`/teachers`)
- **GET (teachers, by id):** `staff` **view**
- **POST/PUT/DELETE teachers:** `staff` **edit**
- **Attendance routes (GET):** `attendance` **view**
- **Attendance routes (POST/PUT/DELETE):** `attendance` **edit**
- **Payroll routes (GET):** `payroll` **view**
- **Payroll routes (POST/PUT/DELETE):** `payroll` **edit**

### Finance (`/finance`)
- **Categories, income, expense, accounts, ledgers, summary (GET):** `finance` **view**
- **Categories, income, expense, accounts, ledgers, summary (POST/PUT/DELETE):** `finance` **edit**
- **Saved invoice / fee config (GET):** `fees` **view**
- **Saved invoice / fee config (POST/PUT/DELETE):** `fees` **edit**
- **Invoices (GET):** `invoice` **view**
- **Invoices (POST/PUT/DELETE):** `invoice` **edit**
- **Payments (GET):** `payments` **view**
- **Payments (POST/PUT/DELETE):** `payments` **edit**

### Colleges / Settings (`/colleges`)
- **GET /colleges, GET /colleges/:id:** `settings` **view**
- **POST/PUT/DELETE colleges:** `settings` **edit**

### Academic (`/academic`)
- **GET (batches, courses, subjects, etc.):** `academic` **view**
- **POST/PUT/DELETE:** `academic` **edit**

### Analytics (`/analytics`)
- **GET:** `finance` **view**
- **POST/PUT/DELETE (if any):** `finance` **edit**

### College attendance criteria (`/college-attendance-criteria`)
- **GET:** `settings` **view**
- **POST/PUT/DELETE:** `settings` **edit**

### Upload (`/upload`)
- **All upload routes:** `settings` **edit** (no view-only).

---

## List of permission resources (for roles)

When creating or editing a **role**, you assign permissions per resource with action `view`, `edit`, or `none`:

| Resource   | Description |
|-----------|-------------|
| `academic`  | Batches, courses, subjects, academic structure |
| `students`  | Student records |
| `staff`     | Teachers / staff records |
| `attendance`| Staff/teacher attendance |
| `fees`      | Fee configuration, saved invoice contents |
| `invoice`   | Invoices |
| `payments`  | Payments |
| `payroll`  | Payroll |
| `finance`   | Finance (categories, income, expense, accounts, ledgers, summary), analytics |
| `settings`  | Colleges, college attendance criteria, uploads |
| `team`      | User management (team members) |

**Example:** A role with `students: edit`, `staff: view`, `finance: view` can fully manage students, only view staff, and only view finance/analytics.
