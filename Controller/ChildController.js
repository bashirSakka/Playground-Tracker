const db = require("../DB/connection");

async function addChild(req, res) {
  const {
    father_name,
    mother_name,
    phone,
    emergency_phone,
    full_name,
    gender,
    date_of_birth,
    notes,
    emoji,
    tag_id,
  } = req.body;

  const query_parents =
    "INSERT INTO parents (father_name, mother_name, phone, emergency_phone) VALUES (?,?,?,?)";
  const query_child =
    "INSERT INTO children (full_name, gender, date_of_birth, notes, emoji, tag_id, parent_id) VALUES (?,?,?,?,?,?,?)";

  try {
    const [parents] = await db.execute(query_parents, [
      father_name,
      mother_name,
      phone,
      emergency_phone,
    ]);
    const p_id = parents.insertId;
    const [children] = await db.execute(query_child, [
      full_name,
      gender,
      date_of_birth,
      notes,
      emoji,
      tag_id,
      p_id,
    ]);
    res.json({ success: true, childId: children.insertId });
  } catch (err) {
    console.log(err);
    res.status(500).send("Database error");
  }
}

async function getChildren(req, res) {
  try {
    const [rows] = await db.execute(
      "SELECT c.*, p.father_name, p.mother_name, p.phone, p.emergency_phone FROM children c LEFT JOIN parents p ON c.parent_id = p.id",
    );
    res.json(rows);
  } catch (err) {
    console.log(err);
    res.status(500).send("Database error");
  }
}

async function updateChild(req, res) {
  const { id } = req.params;
  const { full_name, gender, date_of_birth, notes, emoji, tag_id, father_name, mother_name, phone, emergency_phone } = req.body;

  try {
    await db.execute(
      "UPDATE children SET full_name=?, gender=?, date_of_birth=?, notes=?, emoji=?, tag_id=? WHERE id=?",
      [full_name, gender, date_of_birth, notes, emoji, tag_id, id]
    );
    await db.execute(
      "UPDATE parents p JOIN children c ON c.parent_id = p.id SET p.father_name=?, p.mother_name=?, p.phone=?, p.emergency_phone=? WHERE c.id=?",
      [father_name, mother_name, phone, emergency_phone, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).send("Database error");
  }
}

async function deleteChild(req, res) {
  const { id } = req.params;
  try {
    await db.execute("DELETE FROM children WHERE id=?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).send("Database error");
  }
}

async function getAvailableTags(req, res) {
  const ALL_TAGS = ["ChildTag_01", "ChildTag_02", "ChildTag_03"];
  try {
    const [rows] = await db.execute("SELECT tag_id FROM children WHERE tag_id IS NOT NULL");
    const assigned = new Set(rows.map((r) => r.tag_id));
    const available = ALL_TAGS.filter((t) => !assigned.has(t)).map((t) => ({ tag_id: t }));
    res.json(available);
  } catch (err) {
    console.log(err);
    res.status(500).send("Database error");
  }
}

async function getChildSessions(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await db.execute(
      `SELECT check_in, check_out FROM play_sessions
       WHERE child_id = ? AND DATE(check_in) = CURDATE()
       ORDER BY check_in DESC`,
      [id],
    );
    res.json(rows);
  } catch (err) {
    console.log(err);
    res.status(500).send("Database error");
  }
}

module.exports = { addChild, getChildren, updateChild, deleteChild, getAvailableTags, getChildSessions };
