import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("approval.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT,
    level TEXT,
    title TEXT
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    current_approver_role TEXT NOT NULL,
    requester_id INTEGER NOT NULL,
    department TEXT,
    request_group TEXT,
    deadline_days INTEGER,
    leadtime TEXT,
    po_number TEXT,
    budget_plan TEXT,
    budget_code TEXT,
    notes TEXT,
    proposal_overview TEXT,
    proposal_time TEXT,
    proposal_location TEXT,
    proposal_chairperson TEXT,
    proposal_form TEXT,
    proposal_target TEXT,
    proposal_requirements TEXT,
    proposal_method_support TEXT,
    proposal_costs TEXT,
    proposal_results TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    specs TEXT,
    unit TEXT,
    total_qty REAL,
    available_qty REAL,
    purchase_qty REAL,
    unit_price REAL,
    amount REAL,
    reason TEXT,
    FOREIGN KEY (request_id) REFERENCES requests (id)
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    approver_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES requests (id),
    FOREIGN KEY (approver_id) REFERENCES users (id)
  );
`);

// Migration: Add new columns if they don't exist
const columnsToAdd = [
  { name: 'request_group', type: 'TEXT' },
  { name: 'deadline_days', type: 'INTEGER' },
  { name: 'leadtime', type: 'TEXT' },
  { name: 'po_number', type: 'TEXT' },
  { name: 'budget_plan', type: 'TEXT' },
  { name: 'budget_code', type: 'TEXT' },
  { name: 'notes', type: 'TEXT' },
  { name: 'proposal_overview', type: 'TEXT' },
  { name: 'proposal_time', type: 'TEXT' },
  { name: 'proposal_location', type: 'TEXT' },
  { name: 'proposal_chairperson', type: 'TEXT' },
  { name: 'proposal_form', type: 'TEXT' },
  { name: 'proposal_target', type: 'TEXT' },
  { name: 'proposal_requirements', type: 'TEXT' },
  { name: 'proposal_method_support', type: 'TEXT' },
  { name: 'proposal_costs', type: 'TEXT' },
  { name: 'proposal_results', type: 'TEXT' }
];

const tableInfo = db.prepare("PRAGMA table_info(requests)").all() as any[];
const existingColumns = tableInfo.map(col => col.name);

for (const col of columnsToAdd) {
  if (!existingColumns.includes(col.name)) {
    try {
      db.exec(`ALTER TABLE requests ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to requests table`);
    } catch (err) {
      console.error(`Error adding column ${col.name}:`, err);
    }
  }
}

// Seed initial users if empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  const insertUser = db.prepare("INSERT INTO users (employee_id, password, name, role, email, department, level, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  
  try {
    const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, "users.json"), "utf8"));
    db.transaction(() => {
      for (const user of usersData) {
        insertUser.run(
          user.id, 
          user.id, 
          user.name, 
          user.role, 
          `${user.id.toLowerCase()}@example.com`, 
          user.dept || null, 
          user.level || null, 
          user.title || null
        );
      }
    })();
    console.log(`Seeded ${usersData.length} users.`);
  } catch (error) {
    console.error("Error seeding users:", error);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { employee_id, password } = req.body;
    const user = db.prepare("SELECT id, employee_id, name, role, email, department, level, title FROM users WHERE employee_id = ? AND password = ?").get(employee_id, password) as any;
    
    if (user) {
      res.json(user);
    } else {
      res.status(401).json({ error: "Mã nhân viên hoặc mật khẩu không đúng" });
    }
  });

  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all();
    res.json(users);
  });

  app.get("/api/requests", (req, res) => {
    const requests = db.prepare(`
      SELECT r.*, u.name as requester_name 
      FROM requests r 
      JOIN users u ON r.requester_id = u.id
      ORDER BY r.created_at DESC
    `).all();
    res.json(requests);
  });

  app.get("/api/requests/:id/history", (req, res) => {
    const history = db.prepare(`
      SELECT a.*, u.name as approver_name, u.role as approver_role
      FROM approvals a
      JOIN users u ON a.approver_id = u.id
      WHERE a.request_id = ?
      ORDER BY a.created_at ASC
    `).all(req.params.id);
    res.json(history);
  });

  app.get("/api/requests/:id/items", (req, res) => {
    const items = db.prepare("SELECT * FROM request_items WHERE request_id = ?").all(req.params.id);
    res.json(items);
  });

  app.post("/api/requests", (req, res) => {
    const { 
      title, description, amount, type, requester_id,
      request_group, deadline_days, leadtime, po_number,
      budget_plan, budget_code, notes, items,
      proposal_overview, proposal_time, proposal_location,
      proposal_chairperson, proposal_form, proposal_target,
      proposal_requirements, proposal_method_support,
      proposal_costs, proposal_results
    } = req.body;
    
    // Get requester's department
    const requester = db.prepare("SELECT department, role FROM users WHERE id = ?").get(requester_id) as any;
    if (!requester) return res.status(404).json({ error: "Không tìm thấy thông tin người yêu cầu" });

    try {
      const result = db.transaction(() => {
        // Determine initial approver role
        let initialApproverRole = 'MANAGER';
        if (requester.role === 'MANAGER') {
          initialApproverRole = 'CFO';
        } else if (requester.role === 'CFO') {
          initialApproverRole = 'COO';
        } else if (requester.role === 'COO') {
          initialApproverRole = 'COMPLETED';
        }

        const insertRequest = db.prepare(`
          INSERT INTO requests (
            title, description, amount, type, status, current_approver_role, 
            requester_id, department, request_group, deadline_days, 
            leadtime, po_number, budget_plan, budget_code, notes,
            proposal_overview, proposal_time, proposal_location,
            proposal_chairperson, proposal_form, proposal_target,
            proposal_requirements, proposal_method_support,
            proposal_costs, proposal_results
          )
          VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          title, description, amount, type, initialApproverRole, requester_id, requester.department,
          request_group, deadline_days, leadtime, po_number,
          budget_plan, budget_code, notes,
          proposal_overview, proposal_time, proposal_location,
          proposal_chairperson, proposal_form, proposal_target,
          proposal_requirements, proposal_method_support,
          proposal_costs, proposal_results
        );

        const requestId = insertRequest.lastInsertRowid;

        if (items && Array.isArray(items)) {
          const insertItem = db.prepare(`
            INSERT INTO request_items (
              request_id, item_name, specs, unit, total_qty, 
              available_qty, purchase_qty, unit_price, amount, reason
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const item of items) {
            insertItem.run(
              requestId, item.item_name, item.specs, item.unit, item.total_qty,
              item.available_qty, item.purchase_qty, item.unit_price, item.amount, item.reason
            );
          }
        }

        return requestId;
      })();

      res.json({ id: result });
    } catch (error: any) {
      console.error("Create request error:", error);
      res.status(500).json({ error: "Lỗi hệ thống khi tạo yêu cầu: " + error.message });
    }
  });

  app.post("/api/requests/:id/approve", (req, res) => {
    const { id } = req.params;
    const { approver_id, status, comment } = req.body;
    console.log(`Approval request received: ID=${id}, Approver=${approver_id}, Status=${status}`);

    try {
      const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as any;
      if (!request) {
        console.log(`Request ${id} not found`);
        return res.status(404).json({ error: "Yêu cầu không tồn tại" });
      }

      const approver = db.prepare("SELECT * FROM users WHERE id = ?").get(approver_id) as any;
      if (!approver) {
        console.log(`Approver ${approver_id} not found`);
        return res.status(404).json({ error: "Người duyệt không tồn tại" });
      }

      console.log(`Validating approval: Request Dept=${request.department}, Approver Dept=${approver.department}, Role=${approver.role}, Current Step=${request.current_approver_role}`);

      // Validation logic
      if (request.current_approver_role === 'MANAGER') {
        if (approver.role !== 'MANAGER' || approver.department !== request.department) {
          return res.status(403).json({ error: `Chỉ quản lý bộ phận ${request.department} mới có quyền phê duyệt bước này` });
        }
      } else if (request.current_approver_role === 'CFO') {
        if (approver.role !== 'CFO') {
          return res.status(403).json({ error: "Chỉ CFO mới có quyền phê duyệt bước này" });
        }
      } else if (request.current_approver_role === 'COO') {
        if (approver.role !== 'COO') {
          return res.status(403).json({ error: "Chỉ COO mới có quyền phê duyệt bước này" });
        }
      }

      db.transaction(() => {
        // Record approval
        db.prepare(`
          INSERT INTO approvals (request_id, approver_id, status, comment)
          VALUES (?, ?, ?, ?)
        `).run(id, approver_id, status, comment);

        if (status === 'REJECTED') {
          // Returned to the first step
          db.prepare("UPDATE requests SET status = 'REJECTED', current_approver_role = 'MANAGER' WHERE id = ?").run(id);
        } else {
          // Approval logic
          let nextRole: string | 'COMPLETED' = 'COMPLETED';
          if (request.current_approver_role === 'MANAGER') {
            nextRole = 'CFO';
          } else if (request.current_approver_role === 'CFO') {
            nextRole = 'COO';
          } else if (request.current_approver_role === 'COO') {
            nextRole = 'COMPLETED';
          }

          if (nextRole === 'COMPLETED') {
            db.prepare("UPDATE requests SET status = 'APPROVED', current_approver_role = 'COMPLETED' WHERE id = ?").run(id);
          } else {
            db.prepare("UPDATE requests SET current_approver_role = ? WHERE id = ?").run(nextRole, id);
          }
        }
      })();

      console.log(`Approval successful for request ${id}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Approval error:", error);
      res.status(500).json({ error: "Lỗi hệ thống khi xử lý phê duyệt: " + error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
