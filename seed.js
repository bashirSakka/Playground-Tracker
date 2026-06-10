const db = require("./DB/connection");

const children = [
  { father: "Ahmed Al-Hassan", mother: "Fatima Al-Hassan", phone: "0501234567", emergency: "0509876543", name: "Omar Al-Hassan", gender: "Male", dob: "2019-03-15", notes: "Allergic to nuts", emoji: "👦", tag: "ChildTag_01" },
  { father: "Khalid Al-Rashid", mother: "Nour Al-Rashid", phone: "0502345678", emergency: "0508765432", name: "Sara Al-Rashid", gender: "Female", dob: "2020-07-22", notes: "", emoji: "👧", tag: "ChildTag_02" },
  { father: "Mohammad Al-Zahra", mother: "Hana Al-Zahra", phone: "0503456789", emergency: "0507654321", name: "Yusuf Al-Zahra", gender: "Male", dob: "2018-11-08", notes: "Asthma inhaler in bag", emoji: "👦", tag: "ChildTag_03" },
  { father: "Tariq Mansour", mother: "Layla Mansour", phone: "0504567890", emergency: "0506543210", name: "Lina Mansour", gender: "Female", dob: "2021-01-30", notes: "", emoji: "👧", tag: null },
  { father: "Faisal Al-Otaibi", mother: "Reem Al-Otaibi", phone: "0505678901", emergency: "0505432109", name: "Hamza Al-Otaibi", gender: "Male", dob: "2019-06-14", notes: "Lactose intolerant", emoji: "👦", tag: null },
  { father: "Samir Khalil", mother: "Dina Khalil", phone: "0506789012", emergency: "0504321098", name: "Maya Khalil", gender: "Female", dob: "2020-09-05", notes: "", emoji: "👧", tag: null },
  { father: "Ibrahim Al-Farsi", mother: "Mona Al-Farsi", phone: "0507890123", emergency: "0503210987", name: "Adam Al-Farsi", gender: "Male", dob: "2018-04-19", notes: "Wears glasses", emoji: "👦", tag: null },
  { father: "Walid Jaber", mother: "Sana Jaber", phone: "0508901234", emergency: "0502109876", name: "Nadia Jaber", gender: "Female", dob: "2021-12-03", notes: "", emoji: "👧", tag: null },
  { father: "Hassan Al-Shammari", mother: "Amal Al-Shammari", phone: "0509012345", emergency: "0501098765", name: "Zaid Al-Shammari", gender: "Male", dob: "2019-08-27", notes: "", emoji: "👦", tag: null },
  { father: "Nasser Al-Qahtani", mother: "Eman Al-Qahtani", phone: "0501122334", emergency: "0509988776", name: "Hessa Al-Qahtani", gender: "Female", dob: "2020-02-11", notes: "Shy, needs extra attention", emoji: "👧", tag: null },
  { father: "Yousef Al-Ghamdi", mother: "Rania Al-Ghamdi", phone: "0502233445", emergency: "0508877665", name: "Bilal Al-Ghamdi", gender: "Male", dob: "2018-07-16", notes: "", emoji: "👦", tag: null },
  { father: "Ali Al-Dossari", mother: "Najla Al-Dossari", phone: "0503344556", emergency: "0507766554", name: "Rima Al-Dossari", gender: "Female", dob: "2021-05-09", notes: "Peanut allergy - EpiPen in bag", emoji: "👧", tag: null },
  { father: "Sami Badr", mother: "Hind Badr", phone: "0504455667", emergency: "0506655443", name: "Kareem Badr", gender: "Male", dob: "2019-10-23", notes: "", emoji: "👦", tag: null },
  { father: "Rami Saleh", mother: "Noha Saleh", phone: "0505566778", emergency: "0505544332", name: "Tala Saleh", gender: "Female", dob: "2020-04-17", notes: "", emoji: "👧", tag: null },
  { father: "Omar Khoury", mother: "Lara Khoury", phone: "0506677889", emergency: "0504433221", name: "Jad Khoury", gender: "Male", dob: "2018-12-01", notes: "Hyperactive, loves running", emoji: "👦", tag: null },
  { father: "Majed Al-Harbi", mother: "Wafa Al-Harbi", phone: "0507788990", emergency: "0503322110", name: "Ghada Al-Harbi", gender: "Female", dob: "2021-08-14", notes: "", emoji: "👧", tag: null },
  { father: "Abdulaziz Noor", mother: "Samia Noor", phone: "0508899001", emergency: "0502211009", name: "Faris Noor", gender: "Male", dob: "2019-01-28", notes: "Diabetic - snack schedule required", emoji: "👦", tag: null },
  { father: "Khaled Bishara", mother: "Rita Bishara", phone: "0509900112", emergency: "0501100998", name: "Dana Bishara", gender: "Female", dob: "2020-11-07", notes: "", emoji: "👧", tag: null },
  { father: "Bassam Toufeili", mother: "Nadia Toufeili", phone: "0501011223", emergency: "0509900887", name: "Sami Toufeili", gender: "Male", dob: "2018-09-20", notes: "", emoji: "👦", tag: null },
  { father: "Tarek Aziz", mother: "Ines Aziz", phone: "0502122334", emergency: "0508811776", name: "Lara Aziz", gender: "Female", dob: "2021-03-12", notes: "Separation anxiety", emoji: "👧", tag: null },
];

async function seed() {
  const q_parent = "INSERT INTO parents (father_name, mother_name, phone, emergency_phone) VALUES (?,?,?,?)";
  const q_child = "INSERT INTO children (full_name, gender, date_of_birth, notes, emoji, tag_id, parent_id) VALUES (?,?,?,?,?,?,?)";

  try {
    for (const c of children) {
      const [p] = await db.execute(q_parent, [c.father, c.mother, c.phone, c.emergency]);
      await db.execute(q_child, [c.name, c.gender, c.dob, c.notes, c.emoji, c.tag, p.insertId]);
      console.log(`Inserted: ${c.name}`);
    }
    console.log("\nDone — 20 children inserted.");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    process.exit(0);
  }
}

seed();
