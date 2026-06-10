const db = require("../DB/connection");

async function loginAdmin(req, res) {
  const { uname, pass } = req.body;
  // console.log(username, password);
  const query = "SELECT * FROM user_admin WHERE username=? AND password=?";

  try {
    const [results] = await db.query(query, [uname, pass]);
    if (results.length > 0) {
      req.session.userId = results[0].id;
      req.session.username = results[0].username;
      res.redirect("/home");
    } else {
      res.send("Invalid username or password");
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Database error");
  }
}

module.exports = {
  loginAdmin,
};
