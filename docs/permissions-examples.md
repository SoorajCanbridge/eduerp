# Permissions: actions and examples

## Actions (only these)

| Action | Meaning |
|--------|--------|
| **view** | Read only (GET). Cannot create, update or delete. |
| **edit** | Full access: view + create + update + delete. |
| **none** | No access. Omit the permission or set action to `none`. |

Resources: `academic`, `students`, `staff`, `attendance`, `fees`, `invoice`, `payments`, `payrolls`, `finance`, `settings`, `team`.

---

## Example: Create role (POST /api/v1/roles)

**Payload:**

```json
{
  "name": "accountant",
  "description": "Can view and edit finance, fees, invoice, payments; view only students",
  "permissions": [
    { "resource": "finance", "action": "edit" },
    { "resource": "fees", "action": "edit" },
    { "resource": "invoice", "action": "edit" },
    { "resource": "payments", "action": "edit" },
    { "resource": "students", "action": "view" }
  ]
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "_id": "67cfa4b2b0f5e92a3b123458",
    "name": "accountant",
    "description": "Can view and edit finance, fees, invoice, payments; view only students",
    "permissions": [
      { "resource": "finance", "action": "edit" },
      { "resource": "fees", "action": "edit" },
      { "resource": "invoice", "action": "edit" },
      { "resource": "payments", "action": "edit" },
      { "resource": "students", "action": "view" }
    ],
    "college": null,
    "createdAt": "2026-03-05T10:00:00.000Z",
    "updatedAt": "2026-03-05T10:00:00.000Z"
  }
}
```

---

## Example: Get role (GET /api/v1/roles/:id)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "_id": "67cfa4b2b0f5e92a3b123458",
    "name": "accountant",
    "description": "Can view and edit finance, fees, invoice, payments; view only students",
    "permissions": [
      { "resource": "finance", "action": "edit" },
      { "resource": "fees", "action": "edit" },
      { "resource": "invoice", "action": "edit" },
      { "resource": "payments", "action": "edit" },
      { "resource": "students", "action": "view" }
    ],
    "college": null,
    "createdAt": "2026-03-05T10:00:00.000Z",
    "updatedAt": "2026-03-05T10:00:00.000Z"
  }
}
```

---

## Example: Update role (PUT /api/v1/roles/:id)

**Payload (only view, no edit):**

```json
{
  "permissions": [
    { "resource": "students", "action": "view" },
    { "resource": "staff", "action": "view" },
    { "resource": "finance", "action": "none" }
  ]
}
```

(Omitted resources are unchanged. Use full list to replace all permissions.)

---

## Example: Full-access owner role (payload only)

```json
{
  "name": "owner",
  "description": "Full access to all modules",
  "permissions": [
    { "resource": "academic", "action": "edit" },
    { "resource": "students", "action": "edit" },
    { "resource": "staff", "action": "edit" },
    { "resource": "attendance", "action": "edit" },
    { "resource": "fees", "action": "edit" },
    { "resource": "invoice", "action": "edit" },
    { "resource": "payments", "action": "edit" },
    { "resource": "payrolls", "action": "edit" },
    { "resource": "finance", "action": "edit" },
    { "resource": "settings", "action": "edit" },
    { "resource": "team", "action": "edit" }
  ]
}
```

---

## Example: No access (omit or use none)

- Omit a resource from `permissions` → no access to that resource.
- Or set `"action": "none"` for that resource.

```json
{
  "name": "viewer",
  "description": "View only",
  "permissions": [
    { "resource": "students", "action": "view" },
    { "resource": "staff", "action": "view" },
    { "resource": "finance", "action": "none" }
  ]
}
```

Here `finance` has no access; `students` and `staff` are view-only.
